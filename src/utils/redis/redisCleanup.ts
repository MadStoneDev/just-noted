import redis from "@/utils/redis";
import {
  USER_ACTIVITY_PREFIX,
  NOTES_KEY_PREFIX,
  GUEST_NOTE_RETENTION_SECONDS,
  REDIS_CLEANUP_ENABLED,
} from "@/constants/app";
import { readAllNotes, NOTES_BACKUP_PREFIX, NOTES_STAGING_PREFIX } from "@/utils/redis/note-store";

export interface CleanupStats {
  totalKeys: number;
  deleted: number; // in dry-run, the count that WOULD be deleted
  kept: number;
  undetermined: number; // kept because inactivity couldn't be proven
  failed: number;
}

export interface CleanupResult {
  success: boolean;
  skipped?: boolean;
  dryRun?: boolean;
  stats?: CleanupStats;
  wouldDelete?: string[];
  error?: string;
}

/**
 * Reclaim abandoned guest (Redis) note keys — SAFELY.
 *
 * Guardrails, in order:
 *  1. Env kill-switch: unless REDIS_CLEANUP_ENABLED === "true", a non-dry-run
 *     call deletes nothing. (A dry run is always allowed — it only reads/logs.)
 *  2. Positive-proof deletion: a `notes:{id}` key is deleted only when we can
 *     prove it has been idle past GUEST_NOTE_RETENTION_SECONDS, using the most
 *     recent of (its activity timestamp, the newest note's updatedAt in the
 *     key). If we can't determine a timestamp, or a read fails, the key is KEPT
 *     ("undetermined"). We never guess-delete.
 *
 * The previous implementation deleted any `notes:{id}` whose id wasn't in the
 * activity set — but activity was only ever recorded under Supabase auth ids
 * while note keys use anonymous ids, so every guest key was "inactive" and
 * would have been wiped. See user-activity route for the recording fix.
 */
export async function cleanupOldNotes(options?: { dryRun?: boolean }): Promise<CleanupResult> {
  const dryRun = options?.dryRun ?? false;

  if (!REDIS_CLEANUP_ENABLED && !dryRun) {
    console.log("Redis cleanup skipped: REDIS_CLEANUP_ENABLED is not 'true'");
    return { success: true, skipped: true };
  }

  try {
    const noteKeys = await scanAllKeys(`${NOTES_KEY_PREFIX}*`);
    const activityKeys = await scanAllKeys(`${USER_ACTIVITY_PREFIX}*`);

    // id -> last-access ms, from the activity keys' stored timestamps.
    const lastActivity = new Map<string, number>();
    for (const key of activityKeys) {
      const id = key.slice(USER_ACTIVITY_PREFIX.length);
      try {
        const val = await redis.get<string | number>(key);
        const ts = typeof val === "number" ? val : parseInt(String(val ?? ""), 10);
        if (Number.isFinite(ts)) lastActivity.set(id, ts);
      } catch {
        /* ignore a single activity read error */
      }
    }

    const now = Date.now();
    const cutoff = now - GUEST_NOTE_RETENTION_SECONDS * 1000;

    let deleted = 0;
    let kept = 0;
    let undetermined = 0;
    let failed = 0;
    const wouldDelete: string[] = [];

    for (const noteKey of noteKeys) {
      // Never touch reversible backups or in-flight migration staging. (The
      // `notes:*` glob doesn't match `notes_backup:*`/`notes_staging:*` — the
      // ':' vs '_' differs — but guard explicitly so it can never regress.)
      if (noteKey.startsWith(NOTES_BACKUP_PREFIX) || noteKey.startsWith(NOTES_STAGING_PREFIX)) {
        continue;
      }
      const id = noteKey.slice(NOTES_KEY_PREFIX.length);

      // Newest signal of life: activity timestamp OR newest note updatedAt.
      // readAllNotes reads the per-note hash (and falls back to a legacy array).
      let lastSeen = lastActivity.get(id) ?? 0;
      try {
        const notes = await readAllNotes(id);
        for (const n of notes) {
          const u =
            typeof n?.updatedAt === "number"
              ? n.updatedAt
              : typeof n?.createdAt === "number"
                ? n.createdAt
                : 0;
          if (u > lastSeen) lastSeen = u;
        }
      } catch {
        // Couldn't read the notes — never delete on uncertainty.
        undetermined++;
        kept++;
        continue;
      }

      if (lastSeen === 0) {
        // No timestamp anywhere — keep it, don't guess.
        undetermined++;
        kept++;
        continue;
      }
      if (lastSeen > cutoff) {
        kept++;
        continue;
      }

      // Provably idle past the retention window → eligible.
      if (dryRun) {
        wouldDelete.push(noteKey);
        deleted++;
        continue;
      }
      try {
        await redis.del(noteKey);
        deleted++;
      } catch {
        failed++;
        console.error("Failed to delete abandoned notes key");
      }
    }

    const stats: CleanupStats = { totalKeys: noteKeys.length, deleted, kept, undetermined, failed };
    console.log(`Redis cleanup ${dryRun ? "(DRY RUN) " : ""}completed:`, JSON.stringify(stats));
    if (dryRun && wouldDelete.length) {
      console.log(`Redis cleanup (DRY RUN) would delete:`, JSON.stringify(wouldDelete));
    }
    return { success: true, dryRun, stats, ...(dryRun ? { wouldDelete } : {}) };
  } catch (error) {
    console.error("Redis cleanup failed:", error);
    return { success: false, error: String(error) };
  }
}

export async function scanAllKeys(pattern: string): Promise<string[]> {
  let cursor = 0;
  const allKeys: string[] = [];

  do {
    const [newCursor, keys] = await redis.scan(cursor, { match: pattern });

    cursor =
      typeof newCursor === "string" ? parseInt(newCursor, 10) : newCursor;

    // Add the keys to our collection
    if (Array.isArray(keys)) {
      allKeys.push(...keys);
    }
  } while (cursor !== 0);

  return allKeys;
}
