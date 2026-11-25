// Phase 3: per-note Redis storage.
//
// Each user's notes live in ONE Redis HASH `notes:{userId}` with one field per
// note id -> the note's JSON. Concurrent saves to DIFFERENT notes touch
// different fields and can't clobber each other; concurrent saves to the SAME
// note go through an atomic per-note compare-and-set (Lua).
//
// Values are stored as raw JSON strings (we stringify/parse ourselves), so the
// Lua full-value CAS compares the stored value byte-for-byte — no cjson needed.
//
// Migration from the legacy single-array shape is lazy (on first write, via
// ensureHash) and can also be run in bulk (see api/admin/migrate-notes). Both
// paths back up the original array to `notes_backup:{userId}` (30-day TTL) and
// use a compare-guard so a save landing mid-migration is never lost.

import { redis } from "@/lib/redis";
import { randomUUID } from "crypto";
import type { RedisNote } from "@/types/combined-notes";
import { sameNoteContent } from "@/utils/notes-utils";
import {
  decideBackgroundWrite,
  conflictCopyTitle,
  type ConflictCopySpec,
} from "@/utils/background-conflict";

export const NOTES_HASH_PREFIX = "notes:";
export const NOTES_BACKUP_PREFIX = "notes_backup:";
export const NOTES_STAGING_PREFIX = "notes_staging:";
export const BACKUP_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Conservative ceiling for a single EVAL payload, kept well under the client's
// command timeout. Above this we migrate in batches via a staging key.
const EVAL_SIZE_LIMIT = 800_000;
const HSET_BATCH_BYTES = 400_000;

const MAX_ATTEMPTS = 5;
const backoffMs = (attempt: number) => Math.min(50 * 2 ** attempt, 800);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const NOTES_REV_PREFIX = "notes_rev:";
const notesKey = (userId: string) => `${NOTES_HASH_PREFIX}${userId}`;
const backupKey = (userId: string) => `${NOTES_BACKUP_PREFIX}${userId}`;
const stagingKey = (userId: string) => `${NOTES_STAGING_PREFIX}${userId}`;
const revKey = (userId: string) => `${NOTES_REV_PREFIX}${userId}`;

// A tiny per-user revision counter bumped on every write, so a poll can do a
// cheap 1-command change check and skip the full HGETALL when nothing changed.
// Fire-and-forget on writes.
function touchRevision(userId: string): void {
  try {
    Promise.resolve(redis.incr(revKey(userId))).catch(() => {});
  } catch {
    /* best-effort */
  }
}

/** Current revision (0 if none). One cheap GET. */
export async function getNotesRevision(userId: string): Promise<number> {
  try {
    const n = Number((await redis.get(revKey(userId))) ?? "0");
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

const conflictTitle = (base: string) => {
  const stamp = new Date().toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
  return `${base || "Untitled"} (conflicted copy, ${stamp})`;
};

// ── Lua ────────────────────────────────────────────────────────────────────

// Atomic per-note compare-and-set. Applies the new note (and an optional
// conflicted-copy field) only if the stored field still equals what we read.
const CAS_LUA = `
local cur = redis.call('HGET', KEYS[1], ARGV[1])
if cur ~= ARGV[2] then return 0 end
if ARGV[4] ~= '' then redis.call('HSET', KEYS[1], ARGV[4], ARGV[5]) end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
return 1
`;

// Single-shot array -> hash migration, guarded by a byte-compare of the
// original so a save landing between our JS read and this script isn't lost.
const MIGRATE_LUA = `
local t = redis.call('TYPE', KEYS[1])['ok']
if t == 'hash' then return 'already-hash' end
if t == 'none' then return 'empty' end
if t ~= 'string' then return 'unexpected' end
local cur = redis.call('GET', KEYS[1])
if cur ~= ARGV[1] then return 'changed' end
redis.call('SET', KEYS[2], cur, 'EX', tonumber(ARGV[2]))
redis.call('DEL', KEYS[1])
for i = 3, #ARGV, 2 do
  redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1])
end
return 'migrated'
`;

// Final guarded swap for the batched (oversized) path: backup + delete original
// + rename the fully-built staging hash into place, only if the original is
// unchanged. KEYS: [notesKey, backupKey, stagingKey].
const SWAP_LUA = `
local t = redis.call('TYPE', KEYS[1])['ok']
if t ~= 'string' then redis.call('DEL', KEYS[3]); return 'not-string' end
local cur = redis.call('GET', KEYS[1])
if cur ~= ARGV[1] then redis.call('DEL', KEYS[3]); return 'changed' end
redis.call('SET', KEYS[2], cur, 'EX', tonumber(ARGV[2]))
redis.call('DEL', KEYS[1])
redis.call('RENAME', KEYS[3], KEYS[1])
return 'migrated'
`;

// ── Helpers ──────────────────────────────────────────────────────────────

function parseNote(raw: unknown): RedisNote | null {
  if (raw == null) return null;
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as RedisNote) : (raw as RedisNote);
  } catch {
    return null;
  }
}

function estimateSize(rawArray: string, notes: RedisNote[]): number {
  let total = rawArray.length;
  for (const n of notes) total += (n.id?.length ?? 36) + JSON.stringify(n).length + 8;
  return total;
}

// ── Migration (array -> hash) ────────────────────────────────────────────

export interface MigrateOutcome {
  status: "migrated" | "already-hash" | "empty" | "skipped";
  oversized?: boolean;
  fields?: number;
}

/**
 * Convert one user's legacy array key to the per-note hash, if needed. Idempotent
 * and safe to call before any write. Small keys use a single guarded Lua; large
 * keys stage batched HSETs then do a guarded swap. Retries on a concurrent write.
 */
export async function ensureHash(userId: string, dryRun = false): Promise<MigrateOutcome> {
  const key = notesKey(userId);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const type = await redis.type(key);
    if (type === "hash") return { status: "already-hash" };
    if (type === "none") return { status: "empty" };
    if (type !== "string") throw new Error(`Unexpected Redis type for ${key}: ${type}`);

    const raw = await redis.get(key);
    if (raw == null) return { status: "empty" };

    let arr: RedisNote[];
    try {
      arr = JSON.parse(raw) as RedisNote[];
      if (!Array.isArray(arr)) throw new Error("not an array");
    } catch {
      throw new Error(`Legacy notes key ${key} is not a JSON array`);
    }

    const size = estimateSize(raw, arr);
    const oversized = size > EVAL_SIZE_LIMIT;

    if (dryRun) {
      return { status: "migrated", oversized, fields: arr.length };
    }

    if (!oversized) {
      const argv: string[] = [raw, String(BACKUP_TTL_SECONDS)];
      for (const n of arr) argv.push(n.id, JSON.stringify(n));
      const res = (await redis.eval(MIGRATE_LUA, 2, key, backupKey(userId), ...argv)) as string;
      if (res === "changed") {
        await sleep(backoffMs(attempt));
        continue;
      }
      return { status: res === "migrated" ? "migrated" : (res as any), oversized: false, fields: arr.length };
    }

    // Oversized: build the hash in a staging key in size-bounded batches, then
    // guarded-swap it into place. If the original changed meanwhile, the swap
    // returns "changed", we drop staging and retry.
    const staging = stagingKey(userId);
    await redis.del(staging);
    let batch: Record<string, string> = {};
    let batchBytes = 0;
    const flush = async () => {
      const entries = Object.entries(batch);
      if (entries.length) {
        await redis.hset(staging, batch);
      }
      batch = {};
      batchBytes = 0;
    };
    for (const n of arr) {
      const val = JSON.stringify(n);
      batch[n.id] = val;
      batchBytes += n.id.length + val.length;
      if (batchBytes >= HSET_BATCH_BYTES) await flush();
    }
    await flush();

    const res = (await redis.eval(
      SWAP_LUA,
      3,
      key,
      backupKey(userId),
      staging,
      raw,
      String(BACKUP_TTL_SECONDS),
    )) as string;
    if (res === "changed" || res === "not-string") {
      await sleep(backoffMs(attempt));
      continue;
    }
    return { status: "migrated", oversized: true, fields: arr.length };
  }
  throw new Error(`ensureHash: retries exhausted for ${userId}`);
}

// ── Reads ────────────────────────────────────────────────────────────────

/** All of a user's notes. Reads the hash, falling back to the legacy array. */
export async function readAllNotes(userId: string): Promise<RedisNote[]> {
  const key = notesKey(userId);
  try {
    // ioredis returns {} (not null) for a missing key.
    const all = await redis.hgetall(key);
    const out: RedisNote[] = [];
    for (const v of Object.values(all)) {
      const n = parseNote(v);
      if (n) out.push(n);
    }
    return out;
  } catch (e: any) {
    // WRONGTYPE => still a legacy array string. Read it directly (don't migrate
    // on a read path); the next write migrates it.
    const raw = await redis.get(key);
    if (raw == null) return [];
    try {
      const arr = JSON.parse(raw) as RedisNote[];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
}

// ── Writes ───────────────────────────────────────────────────────────────

/** Upsert a whole note field (create, metadata changes). Ensures the hash first. */
export async function putNote(userId: string, note: RedisNote): Promise<void> {
  await ensureHash(userId);
  await redis.hset(notesKey(userId), { [note.id]: JSON.stringify(note) });
  touchRevision(userId);
}

/** Remove a note field. */
export async function deleteNote(userId: string, noteId: string): Promise<boolean> {
  await ensureHash(userId);
  const removed = await redis.hdel(notesKey(userId), noteId);
  if (removed > 0) touchRevision(userId);
  return removed > 0;
}

export interface CasResult {
  success: boolean;
  version?: number;
  conflicted?: boolean;
  error?: string;
}

/**
 * Atomic per-note content update. Reads the current field, and applies the new
 * content only if the field is unchanged (Lua CAS). If the stored version has
 * moved past the caller's base, the existing content is preserved as a
 * "(conflicted copy)" field in the same atomic step, then the new content is
 * applied. Retries on a lost CAS; on exhaustion returns failure so the caller
 * queues it (surfacing "Sync problem" rather than looping or losing the edit).
 */
export async function casUpdateNote(
  userId: string,
  noteId: string,
  patch: { content: string; goal: number; goalType: "" | "words" | "characters" },
  baseVersion?: number,
  /**
   * Background write (offline-queue replay): on a conflict keep the stored
   * note untouched and save the INCOMING text as this conflicted copy (fixed id,
   * so a retry makes at most one). See utils/background-conflict.ts.
   */
  keepServer?: ConflictCopySpec,
  /** Background write from a queue entry with no base version (older build):
   * the server counts as "at base" only if unchanged since this time. */
  queuedAt?: number,
): Promise<CasResult> {
  const key = notesKey(userId);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await ensureHash(userId);
    const raw = await redis.hget(key, noteId);
    if (raw == null) return { success: false, error: "not_found" };

    const cur = parseNote(raw);
    if (!cur) return { success: false, error: "corrupt" };
    const curVersion = cur.version ?? 1;

    const bgBase =
      typeof baseVersion === "number"
        ? { version: baseVersion }
        : typeof queuedAt === "number"
          ? { queuedAt }
          : null;
    if (keepServer && bgBase) {
      const decision = decideBackgroundWrite({
        base: bgBase,
        serverVersion: curVersion,
        serverContent: cur.content,
        serverUpdatedAt: cur.updatedAt ?? null,
        content: patch.content,
      });
      if (decision === "noop") return { success: true, version: curVersion };
      if (decision === "copy") {
        const exists = await redis.hexists(key, keepServer.id);
        if (exists) return { success: true, version: curVersion, conflicted: true };
        const now = Date.now();
        const copy: RedisNote = {
          ...cur,
          id: keepServer.id,
          title: conflictCopyTitle(cur.title, keepServer.stamp),
          content: patch.content,
          goal: patch.goal || 0,
          goal_type: patch.goalType,
          contentFormat: "markdown",
          pinned: false,
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
        // Same CAS script, but the original is written back unchanged: the
        // copy only lands if the note is still exactly what we decided on.
        const res = (await redis.eval(
          CAS_LUA,
          1,
          key,
          noteId,
          raw,
          raw,
          copy.id,
          JSON.stringify(copy),
        )) as number;
        if (res === 1) {
          touchRevision(userId);
          return { success: true, version: curVersion, conflicted: true };
        }
        await sleep(backoffMs(attempt));
        continue;
      }
      // "apply": base matches — fall through to the normal CAS write.
    }

    // A version gap alone isn't a real conflict: if the stored content already
    // matches what we're writing (same normalisation as the save no-op), there's
    // nothing to preserve — just bump the version, no "(conflicted copy)".
    const conflicted =
      typeof baseVersion === "number" &&
      curVersion > baseVersion &&
      !sameNoteContent(cur.content, patch.content);
    let copyField = "";
    let copyRaw = "";
    if (conflicted) {
      const copy: RedisNote = {
        ...cur,
        id: randomUUID(),
        title: conflictTitle(cur.title || ""),
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      copyField = copy.id;
      copyRaw = JSON.stringify(copy);
    }

    const nextVersion = curVersion + 1;
    const updated: RedisNote = {
      ...cur,
      content: patch.content,
      goal: patch.goal || 0,
      goal_type: patch.goalType,
      updatedAt: Date.now(),
      version: nextVersion,
    };

    const res = (await redis.eval(
      CAS_LUA,
      1,
      key,
      noteId,
      raw,
      JSON.stringify(updated),
      copyField,
      copyRaw,
    )) as number;

    if (res === 1) {
      touchRevision(userId);
      return { success: true, version: nextVersion, conflicted };
    }
    // Field changed under us — re-read and retry.
    await sleep(backoffMs(attempt));
  }
  return { success: false, error: "cas_retry_exhausted" };
}

/** Read a single note (for metadata updates that read-modify-write one field). */
export async function getNote(userId: string, noteId: string): Promise<RedisNote | null> {
  return parseNote(await redis.hget(notesKey(userId), noteId));
}

/** Upsert several note fields in one HSET (e.g. batch reorder). */
export async function putNotes(userId: string, notes: RedisNote[]): Promise<void> {
  if (!notes.length) return;
  await ensureHash(userId);
  const obj: Record<string, string> = {};
  for (const n of notes) obj[n.id] = JSON.stringify(n);
  await redis.hset(notesKey(userId), obj);
  touchRevision(userId);
}
