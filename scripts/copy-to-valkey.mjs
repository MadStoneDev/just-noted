#!/usr/bin/env node
// One-off: copy every key from the previous hosted Redis into the self-hosted
// Valkey, adding this project's key prefix (must match KEY_PREFIX in
// src/lib/redis.ts). Valkey wins, except where the source has a strictly newer
// version of a guest note:
//
//   - Strings: SET NX (skipped if the key already exists in Valkey).
//   - Hashes: merged field by field. A field missing from Valkey is added
//     (HSETNX). A field present on both sides is kept as Valkey has it, except
//     in `notes:{id}` hashes (guest notes), where the two copies are compared by
//     their `version`:
//       - source version higher       -> the source copy replaces Valkey's
//                                        (compare-and-set: only if Valkey's
//                                        field is still what was read);
//       - Valkey version higher       -> Valkey's copy stays;
//       - same version, same title and content -> Valkey's copy stays (only
//                                        metadata such as order differs);
//       - same version, different title or content -> CONFLICT: reported
//                                        (key and note id only, never content),
//                                        Valkey's copy stays, nothing is chosen.
//     A new hash keeps the source's remaining TTL; an existing one keeps its own.
//   - Legacy note arrays (`notes:{id}` still a JSON-array string in the source)
//     whose user already has a hash in Valkey are merged into it note by note,
//     by the same rules.
//   - `recovery:{hash}` is skipped if that device has since made a different
//     recovery key in Valkey (so a replaced key can't start working again).
//   - When notes are added to or replaced in a user's existing hash,
//     `notes_rev:{id}` is bumped so open tabs refresh and show them.
//   - Other types are reported and skipped (the app uses none).
//
// Deletions are not copied: a note deleted on one side after an earlier pass
// comes back from the other side's copy.
//
// Run it where VALKEY_URL is reachable (the app container has it); set
// SOURCE_REDIS_URL in the environment to the old rediss:// endpoint:
//
//   node scripts/copy-to-valkey.mjs            # dry run: reads only, writes nothing
//   node scripts/copy-to-valkey.mjs --apply    # copy / merge
//
// Exit code: 0 ok; 1 failed; 2 finished, but with conflicts or mismatches
// (listed on stderr). Re-running is safe: it only fills what's missing and
// replaces what is still older in Valkey. Tests: scripts/copy-to-valkey.test.mjs.

import Redis from "ioredis";
import { pathToFileURL } from "node:url";

const PREFIX = "justnoted:";
const BATCH = 200;
const NOTES = "notes:";
const NOTES_REV = "notes_rev:";
const RECOVERY = "recovery:";
const RECOVERY_OWNER = "recovery_owner:";

/**
 * Which copy of one guest note wins when both sides have it.
 * @param {Buffer|string} srcRaw  source (old Redis) field value
 * @param {Buffer|string} dstRaw  Valkey field value
 * @returns {{action: "same"|"keep"|"replace"|"conflict", reason?: string}}
 */
export function decideNoteField(srcRaw, dstRaw) {
  const s = Buffer.isBuffer(srcRaw) ? srcRaw : Buffer.from(String(srcRaw));
  const d = Buffer.isBuffer(dstRaw) ? dstRaw : Buffer.from(String(dstRaw));
  if (s.equals(d)) return { action: "same" };

  let src;
  let dst;
  try {
    src = JSON.parse(s.toString("utf8"));
    dst = JSON.parse(d.toString("utf8"));
  } catch {
    return { action: "conflict", reason: "unparseable JSON" };
  }
  if (!src || !dst || typeof src !== "object" || typeof dst !== "object") {
    return { action: "conflict", reason: "not a note object" };
  }
  // Same default as the app (note-store: `cur.version ?? 1`).
  const sv = src.version ?? 1;
  const dv = dst.version ?? 1;
  if (!Number.isFinite(sv) || !Number.isFinite(dv)) {
    return { action: "conflict", reason: "non-numeric version" };
  }
  if (sv > dv) return { action: "replace" };
  if (sv < dv) return { action: "keep" };
  if (src.content === dst.content && src.title === dst.title) return { action: "keep" };
  return { action: "conflict", reason: `same version ${sv}, different title/content` };
}

// Atomic merge into one target hash.
// KEYS[1] = target
// ARGV[1] = source pttl; ARGV[2] = number of add pairs;
// then add pairs (field, value) -> HSETNX (a field Valkey already has wins);
// then replace triples (field, expected, value) -> HSET only if the field still
// equals `expected` (compare-and-set against the value read before the merge).
// The source TTL is applied only when this call created the hash.
// Returns {existed (0/1, or -1 = target is not a hash), added, replaced,
//          field names whose compare-and-set failed...}.
export const MERGE_LUA = `
local t = redis.call('TYPE', KEYS[1])['ok']
if t ~= 'none' and t ~= 'hash' then return {-1, 0, 0} end
local nAdd = tonumber(ARGV[2])
local added, replaced = 0, 0
local failed = {}
local i = 3
for _ = 1, nAdd do
  added = added + redis.call('HSETNX', KEYS[1], ARGV[i], ARGV[i + 1])
  i = i + 2
end
while i <= #ARGV do
  if redis.call('HGET', KEYS[1], ARGV[i]) == ARGV[i + 1] then
    redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 2])
    replaced = replaced + 1
  else
    failed[#failed + 1] = ARGV[i]
  end
  i = i + 3
end
local pttl = tonumber(ARGV[1])
if t == 'none' and added > 0 and pttl > 0 then redis.call('PEXPIRE', KEYS[1], pttl) end
local out = {t == 'hash' and 1 or 0, added, replaced}
for _, f in ipairs(failed) do out[#out + 1] = f end
return out
`;

function check(results, what) {
  for (const [err] of results) if (err) throw new Error(`${what}: ${err.message}`);
  return results.map(([, v]) => v);
}

async function main() {
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

  const stats = {
    scanned: 0,
    byType: {},
    strings: { copied: 0, skippedExisting: 0, skippedSupersededRecovery: 0 },
    hashes: {
      created: 0,
      merged: 0,
      unchanged: 0,
      fieldsAdded: 0,
      fieldsReplacedWithNewer: 0,
      fieldsKeptFromValkey: 0,
      fieldConflicts: 0,
    },
    legacyArraysMergedIntoHash: 0,
    revisionsBumped: 0,
    expired: 0,
    conflicts: [], // never note content: key, note id, reason
    skippedType: {},
  };
  const mismatches = [];

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
        for (const n of arr) if (n && typeof n.id === "string") obj[n.id] = Buffer.from(JSON.stringify(n));
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

  /** obj: {field: Buffer} from the source. */
  async function mergeHash(key, target, obj, pttl) {
    const fields = Object.keys(obj);
    const targetType = await dst.type(target);
    if (targetType !== "none" && targetType !== "hash") {
      stats.conflicts.push(`${key} (Valkey has a ${targetType})`);
      return;
    }
    const isNotes = key.startsWith(NOTES);

    // Decide per field against what Valkey has now.
    let adds = fields;
    const replaces = []; // [field, expected (Valkey's), new (source's)]
    let kept = 0;
    if (targetType === "hash") {
      adds = [];
      const cur = await dst.hmgetBuffer(target, ...fields);
      fields.forEach((f, i) => {
        const d = cur[i];
        if (d == null) return void adds.push(f);
        if (!isNotes) return void kept++;
        const { action, reason } = decideNoteField(obj[f], d);
        if (action === "replace") return void replaces.push([f, d, obj[f]]);
        if (action === "conflict") {
          stats.hashes.fieldConflicts++;
          stats.conflicts.push(`${key} note ${f} (${reason}; Valkey's copy kept)`);
        }
        kept++;
      });
    }

    let existed = targetType === "hash";
    let added = adds.length;
    let replaced = replaces.length;
    if (APPLY && (adds.length || replaces.length)) {
      const args = [String(pttl > 0 ? pttl : 0), String(adds.length)];
      for (const f of adds) args.push(f, obj[f]);
      for (const [f, expected, value] of replaces) args.push(f, expected, value);
      const [ex, nAdded, nReplaced, ...casFailed] = await dst.eval(MERGE_LUA, 1, target, ...args);
      if (ex === -1) {
        stats.conflicts.push(`${key} (Valkey changed type during merge)`);
        return;
      }
      existed = ex === 1;
      added = nAdded;
      replaced = nReplaced;
      for (const f of casFailed) {
        stats.conflicts.push(`${key} note ${f} (changed in Valkey during the merge; Valkey's copy kept, re-run)`);
      }
      kept += adds.length - nAdded + casFailed.length;
      // Verify: every source field is now present in Valkey.
      const missing = await missingFields(target, fields);
      if (missing.length) mismatches.push(`${key} (hash: ${missing.length} of ${fields.length} fields missing)`);
    }

    stats.hashes.fieldsAdded += added;
    stats.hashes.fieldsReplacedWithNewer += replaced;
    stats.hashes.fieldsKeptFromValkey += kept;
    if (!existed) stats.hashes.created++;
    else if (added + replaced > 0) stats.hashes.merged++;
    else stats.hashes.unchanged++;

    // Notes just appeared or changed in a hash the app is already using: bump
    // the revision so polling clients refetch.
    if (existed && added + replaced > 0 && isNotes) {
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

  try {
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
    for (const c of conflicts.slice(0, 200)) console.error("conflict: " + c);
    for (const m of mismatches.slice(0, 50)) console.error("mismatch: " + m);
    if (conflicts.length || mismatches.length) process.exitCode = 2;
  } catch (e) {
    console.error("Copy failed:", e.message);
    process.exitCode = 1;
  } finally {
    src.disconnect();
    dst.disconnect();
  }
}

// Run only as a CLI, so tests can import decideNoteField / MERGE_LUA.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
