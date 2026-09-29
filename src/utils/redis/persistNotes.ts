import redis from "@/utils/redis";
import { NOTES_KEY_PREFIX } from "@/constants/app";
import { scanAllKeys } from "@/utils/redis/redisCleanup";
import { NOTES_BACKUP_PREFIX, NOTES_STAGING_PREFIX } from "@/utils/redis/note-store";

export interface PersistStats {
  totalKeys: number;
  withTtl: number; // keys still on a countdown (would be / were persisted)
  persisted: number; // keys whose TTL was actually removed (0 in dry-run)
  failed: number;
}

export interface PersistResult {
  success: boolean;
  dryRun?: boolean;
  stats?: PersistStats;
  sample?: string[]; // up to 20 example keys with a TTL (dry-run only)
  error?: string;
}

/**
 * One-off migration: remove the leftover 60-day TTL from existing `notes:*`
 * keys so they stop counting down. New writes already use plain SET (no TTL);
 * this catches keys that haven't been written since the TTL change. Safe and
 * idempotent — PERSIST on a key with no TTL is a no-op. Dry-run counts only.
 */
export async function persistNoteKeys(options?: { dryRun?: boolean }): Promise<PersistResult> {
  const dryRun = options?.dryRun ?? false;
  try {
    const keys = await scanAllKeys(`${NOTES_KEY_PREFIX}*`);
    let withTtl = 0;
    let persisted = 0;
    let failed = 0;
    const sample: string[] = [];

    for (const key of keys) {
      // Never touch reversible backups or migration staging — those must keep
      // their own 30-day TTL and are not user note keys.
      if (key.startsWith(NOTES_BACKUP_PREFIX) || key.startsWith(NOTES_STAGING_PREFIX)) {
        continue;
      }
      let ttl: number;
      try {
        // TTL: -1 = no expiry, -2 = key gone, >=0 = seconds remaining.
        ttl = await redis.ttl(key);
      } catch {
        failed++;
        continue;
      }
      if (ttl < 0) continue; // no expiry (or missing) — nothing to do

      withTtl++;
      if (sample.length < 20) sample.push(key);
      if (dryRun) continue;
      try {
        await redis.persist(key);
        persisted++;
      } catch {
        failed++;
      }
    }

    const stats: PersistStats = { totalKeys: keys.length, withTtl, persisted, failed };
    console.log(`Persist notes ${dryRun ? "(DRY RUN) " : ""}completed:`, JSON.stringify(stats));
    return { success: true, dryRun, stats, ...(dryRun ? { sample } : {}) };
  } catch (error) {
    console.error("Persist notes failed:", error);
    return { success: false, error: String(error) };
  }
}
