#!/usr/bin/env node
// READ-ONLY backup of a Redis/Valkey instance to a local JSONL file: one line
// per key, {key, type, pttl, value}, with string values and hash field values
// base64-encoded so binary data survives. Only strings and hashes are dumped
// (the app uses no other types); any others are counted and listed.
//
//   SOURCE_REDIS_URL=rediss://default:<password>@<host>:6379 \
//     node scripts/dump-redis.mjs backups/upstash-2026-11.jsonl
//
// The file holds guest notes and recovery-key hashes in plaintext: keep it
// private (it is created with mode 600) and never commit it.
//
// Restore is not automated. Each line holds enough to rebuild its key
// (SET / HSET, plus PEXPIRE when pttl > 0).

import Redis from "ioredis";
import { openSync, writeSync, closeSync, existsSync } from "node:fs";

const BATCH = 200;
const out = process.argv[2];
const { SOURCE_REDIS_URL } = process.env;
if (!SOURCE_REDIS_URL || !out) {
  console.error("Usage: SOURCE_REDIS_URL=... node scripts/dump-redis.mjs <out.jsonl>");
  process.exit(1);
}
if (existsSync(out)) {
  console.error(`${out} already exists — refusing to overwrite.`);
  process.exit(1);
}

const r = new Redis(SOURCE_REDIS_URL, { connectTimeout: 10_000, maxRetriesPerRequest: 3, lazyConnect: true });

function check(results, what) {
  for (const [err] of results) if (err) throw new Error(`${what}: ${err.message}`);
  return results.map(([, v]) => v);
}

const b64 = (buf) => buf.toString("base64");
const stats = { dbsize: 0, scanned: 0, written: 0, strings: 0, hashes: 0, expired: 0, skippedType: {} };

async function main() {
  await r.connect();
  stats.dbsize = await r.dbsize();
  const fd = openSync(out, "wx", 0o600);
  try {
    let cursor = "0";
    do {
      const [next, keys] = await r.scan(cursor, "COUNT", BATCH);
      cursor = next;
      if (!keys.length) continue;
      stats.scanned += keys.length;
      const meta = check(await keys.reduce((p, k) => p.type(k).pttl(k), r.pipeline()).exec(), "read type/ttl");
      const todo = [];
      keys.forEach((key, i) => {
        const type = meta[i * 2];
        const pttl = Number(meta[i * 2 + 1]);
        if (type === "none" || pttl === -2) return void stats.expired++;
        if (type !== "string" && type !== "hash") {
          stats.skippedType[type] = (stats.skippedType[type] ?? 0) + 1;
          console.error(`skipped (${type}): ${key}`);
          return;
        }
        todo.push({ key, type, pttl });
      });
      if (!todo.length) continue;
      const values = check(
        await todo.reduce((p, t) => (t.type === "string" ? p.getBuffer(t.key) : p.hgetallBuffer(t.key)), r.pipeline()).exec(),
        "read values",
      );
      let chunk = "";
      todo.forEach((t, i) => {
        const v = values[i];
        if (v == null || (t.type === "hash" && Object.keys(v).length === 0)) return void stats.expired++;
        const value =
          t.type === "string" ? b64(v) : Object.fromEntries(Object.entries(v).map(([f, fv]) => [f, b64(fv)]));
        chunk += JSON.stringify({ key: t.key, type: t.type, pttl: t.pttl, value }) + "\n";
        stats.written++;
        stats[t.type === "string" ? "strings" : "hashes"]++;
      });
      writeSync(fd, chunk);
    } while (cursor !== "0");
  } finally {
    closeSync(fd);
  }
  console.log(JSON.stringify(stats, null, 2));
}

main()
  .catch((e) => {
    console.error("Dump failed:", e.message);
    process.exitCode = 1;
  })
  .finally(() => r.disconnect());
