#!/usr/bin/env node
// One-off: copy every key from the previous hosted Redis into the self-hosted
// Valkey, adding this project's key prefix (must match KEY_PREFIX in
// src/lib/redis.ts). Safe to run AFTER the new build is live — Valkey always
// wins, the old data only fills gaps:
//
//   - Strings: SET NX (skipped if the key already exists in Valkey).
//   - Hashes: merged field by field with HSETNX, so notes saved on the new
//     build win and older notes fill in. A new hash keeps its remaining TTL; an
//     existing one keeps its own.
//   - Legacy note arrays (`notes:{id}` still a JSON-array string in the source)
//     whose user already has a hash in Valkey are merged into it note by note.
//   - `recovery:{hash}` is skipped if that device has since made a different
//     recovery key in Valkey (so a replaced key can't start working again).
//   - When notes are added to a user's existing hash, `notes_rev:{id}` is
//     bumped so open tabs refresh and show them.
//   - Other types are reported and skipped (the app uses none).
//
// Run it from the app container (it already has VALKEY_URL); set
// SOURCE_REDIS_URL in the environment to the old rediss:// endpoint:
//
//   node scripts/copy-to-valkey.mjs            # dry run: reads only, writes nothing
//   node scripts/copy-to-valkey.mjs --apply    # copy / merge
//
// Re-running is safe: everything is NX, so a second run only fills what's
// still missing. Run it soon after the deploy: a note deleted on the new build
// before the script runs would be restored from the old copy.

import Redis from "ioredis";

const PREFIX = "justnoted:";
const BATCH = 200;
const NOTES = "notes:";
const NOTES_REV = "notes_rev:";
const RECOVERY = "recovery:";
const RECOVERY_OWNER = "recovery_owner:";

const APPLY = process.argv.includes("--apply");
const { SOURCE_REDIS_URL, VALKEY_URL } = process.env;
if (!SOURCE_REDIS_URL || !VALKEY_URL) {
  console.error("Set SOURCE_REDIS_URL (old Redis) and VALKEY_URL (new Valkey) in the environment.");
  process.exit(1);
}
if (SOURCE_REDIS_URL === VALKEY_URL) {
  console.error("SOURCE_REDIS_URL and VALKEY_URL are the same — refusing.");
  process.exit(1);
}

const opts = { connectTimeout: 10_000, maxRetriesPerRequest: 3, lazyConnect: true };
const src = new Redis(SOURCE_REDIS_URL, opts);
const dst = new Redis(VALKEY_URL, opts); // no keyPrefix: PREFIX is added explicitly

// Atomic merge into one target hash. Fields already present win (HSETNX). The
// source TTL is applied only when this call created the hash.
// KEYS[1] = target; ARGV[1] = source pttl; ARGV[2..] = field, value pairs.
// Returns {existed (0/1, or -1 = target is not a hash), fieldsAdded}.
const MERGE_LUA = `
local t = redis.call('TYPE', KEYS[1])['ok']
if t ~= 'none' and t ~= 'hash' then return {-1, 0} end
local added = 0
for i = 2, #ARGV, 2 do
  added = added + redis.call('HSETNX', KEYS[1], ARGV[i], ARGV[i + 1])
end
local pttl = tonumber(ARGV[1])
if t == 'none' and added > 0 and pttl > 0 then redis.call('PEXPIRE', KEYS[1], pttl) end
return {t == 'hash' and 1 or 0, added}
`;

const stats = {
  scanned: 0,
  byType: {},
  strings: { copied: 0, skippedExisting: 0, skippedSupersededRecovery: 0 },
  hashes: { created: 0, merged: 0, unchanged: 0, fieldsAdded: 0, fieldsKeptFromValkey: 0 },
  legacyArraysMergedIntoHash: 0,
  revisionsBumped: 0,
  expired: 0,
  conflicts: [], // target exists with an incompatible type
  skippedType: {},
};
const mismatches = [];

function check(results, what) {
  for (const [err] of results) if (err) throw new Error(`${what}: ${err.message}`);
  return results.map(([, v]) => v);
}

/** {field: Buffer} -> flat [field, value, ...] for EVAL. */
const flat = (obj) => Object.entries(obj).flat();

/** Fields of `fields` missing from the target hash `key` (target is the truth). */
async function missingFields(key, fields) {
  if (!fields.length) return [];
  const present = await dst.hmget(key, ...fields);
  return fields.filter((_, i) => present[i] == null);
}

async function processKey({ key, type, pttl, value }) {
  const target = PREFIX + key;

  if (type === "string") {
    // Legacy note array whose user already has a hash in Valkey: merge notes in.
    if (key.startsWith(NOTES) && (await dst.type(target)) === "hash") {
      let arr;
      try {
        arr = JSON.parse(value.toString("utf8"));
      } catch {
        arr = null;
      }
      if (!Array.isArray(arr)) {
        stats.conflicts.push(`${key} (source string isn't a note array; Valkey has a hash)`);
        return;
      }
      const obj = {};
      for (const n of arr) if (n && typeof n.id === "string") obj[n.id] = JSON.stringify(n);
      stats.legacyArraysMergedIntoHash++;
      return mergeHash(key, target, obj, pttl);
    }

    // Don't bring back a recovery key the device has since replaced.
    if (key.startsWith(RECOVERY)) {
      const owner = await dst.get(`${PREFIX}${RECOVERY_OWNER}${value.toString("utf8")}`);
      if (owner != null && owner !== key.slice(RECOVERY.length)) {
        stats.strings.skippedSupersededRecovery++;
        return;
      }
    }

    if (!APPLY) {
      if (await dst.exists(target)) stats.strings.skippedExisting++;
      else stats.strings.copied++;
      return;
    }
    const res = pttl > 0 ? await dst.set(target, value, "PX", pttl, "NX") : await dst.set(target, value, "NX");
    if (res !== "OK") return void stats.strings.skippedExisting++;
    stats.strings.copied++;
    const [a, b] = await Promise.all([src.strlen(key), dst.strlen(target)]);
    if (a !== b) mismatches.push(`${key} (string: ${a} vs ${b} bytes)`);
    return;
  }

  // hash
  return mergeHash(key, target, value, pttl);
}

async function mergeHash(key, target, obj, pttl) {
  const fields = Object.keys(obj);
  const targetType = await dst.type(target);
  if (targetType !== "none" && targetType !== "hash") {
    stats.conflicts.push(`${key} (Valkey has a ${targetType})`);
    return;
  }

  let existed;
  let added;
  if (!APPLY) {
    existed = targetType === "hash";
    added = existed ? (await missingFields(target, fields)).length : fields.length;
  } else {
    const [ex, n] = await dst.eval(MERGE_LUA, 1, target, String(pttl > 0 ? pttl : 0), ...flat(obj));
    if (ex === -1) {
      stats.conflicts.push(`${key} (Valkey changed type during merge)`);
      return;
    }
    existed = ex === 1;
    added = n;
    // Verify: every source field is now present in Valkey.
    const missing = await missingFields(target, fields);
    if (missing.length) mismatches.push(`${key} (hash: ${missing.length} of ${fields.length} fields missing)`);
  }

  stats.hashes.fieldsAdded += added;
  stats.hashes.fieldsKeptFromValkey += fields.length - added;
  if (!existed) stats.hashes.created++;
  else if (added > 0) stats.hashes.merged++;
  else stats.hashes.unchanged++;

  // Older notes just appeared in a hash the app is already using: bump the
  // revision so polling clients refetch.
  if (existed && added > 0 && key.startsWith(NOTES)) {
    if (APPLY) await dst.incr(`${PREFIX}${NOTES_REV}${key.slice(NOTES.length)}`);
    stats.revisionsBumped++;
  }
}

async function processBatch(keys) {
  const meta = check(await keys.reduce((p, k) => p.type(k).pttl(k), src.pipeline()).exec(), "read type/ttl");
  const todo = [];
  keys.forEach((key, i) => {
    const type = meta[i * 2];
    const pttl = Number(meta[i * 2 + 1]);
    stats.byType[type] = (stats.byType[type] ?? 0) + 1;
    if (type === "none" || pttl === -2) return void stats.expired++;
    if (type !== "string" && type !== "hash") {
      stats.skippedType[type] = (stats.skippedType[type] ?? 0) + 1;
      return;
    }
    todo.push({ key, type, pttl });
  });
  if (!todo.length) return;

  // One round trip to the (remote) source for all values in the batch.
  const values = check(
    await todo.reduce((p, t) => (t.type === "string" ? p.getBuffer(t.key) : p.hgetallBuffer(t.key)), src.pipeline()).exec(),
    "read values",
  );
  for (let i = 0; i < todo.length; i++) {
    const value = values[i];
    // Vanished between the TYPE and the read.
    if (value == null || (todo[i].type === "hash" && Object.keys(value).length === 0)) {
      stats.expired++;
      continue;
    }
    await processKey({ ...todo[i], value });
  }
}

async function main() {
  await Promise.all([src.connect(), dst.connect()]);
  console.log(`${APPLY ? "APPLYING" : "DRY RUN (no writes)"} -> prefix "${PREFIX}"`);

  let cursor = "0";
  do {
    const [next, keys] = await src.scan(cursor, "COUNT", BATCH);
    cursor = next;
    // Never re-copy keys that already carry the prefix.
    const batch = keys.filter((k) => !k.startsWith(PREFIX));
    stats.scanned += batch.length;
    if (batch.length) await processBatch(batch);
  } while (cursor !== "0");

  const { conflicts, ...rest } = stats;
  console.log(JSON.stringify({ ...rest, conflicts: conflicts.length, mismatches: mismatches.length }, null, 2));
  if (!APPLY) console.log("(counts are what --apply would do)");
  for (const c of conflicts.slice(0, 50)) console.error("conflict: " + c);
  for (const m of mismatches.slice(0, 50)) console.error("mismatch: " + m);
  if (conflicts.length || mismatches.length) process.exitCode = 2;
}

main()
  .catch((e) => {
    console.error("Copy failed:", e.message);
    process.exitCode = 1;
  })
  .finally(() => {
    src.disconnect();
    dst.disconnect();
  });
