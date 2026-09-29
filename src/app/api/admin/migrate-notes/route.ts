import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCleanupRequest } from "@/lib/admin-cleanup-auth";
import { scanAllKeys } from "@/utils/redis/redisCleanup";
import {
  ensureHash,
  NOTES_BACKUP_PREFIX,
  NOTES_STAGING_PREFIX,
} from "@/utils/redis/note-store";
import { NOTES_KEY_PREFIX } from "@/constants/app";

/**
 * Phase 3 migration: convert legacy single-array `notes:{id}` keys to the
 * per-note hash. Each convert backs the original array up to
 * `notes_backup:{id}` (30-day TTL) and is guarded so a concurrent save is never
 * lost. Oversized keys migrate via batched staging.
 *
 *   POST /api/admin/migrate-notes?dryRun=1  → report what would migrate + which
 *                                             keys are oversized, change nothing
 *   POST /api/admin/migrate-notes           → migrate
 *
 * Guarded by the same x-api-key as the other admin jobs. Run the dry-run first.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCleanupRequest(request)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const dryRun =
    request.nextUrl.searchParams.get("dryRun") === "1" ||
    request.nextUrl.searchParams.get("dryRun") === "true";

  try {
    const keys = await scanAllKeys(`${NOTES_KEY_PREFIX}*`);
    let migrated = 0;
    let alreadyHash = 0;
    let empty = 0;
    let oversized = 0;
    let failed = 0;
    const oversizedKeys: string[] = [];
    const failures: { key: string; error: string }[] = [];

    for (const key of keys) {
      if (key.startsWith(NOTES_BACKUP_PREFIX) || key.startsWith(NOTES_STAGING_PREFIX)) {
        continue;
      }
      const userId = key.slice(NOTES_KEY_PREFIX.length);
      try {
        const r = await ensureHash(userId, dryRun);
        if (r.status === "already-hash") alreadyHash++;
        else if (r.status === "empty") empty++;
        else {
          migrated++;
          if (r.oversized) {
            oversized++;
            oversizedKeys.push(key);
          }
        }
      } catch (e) {
        failed++;
        failures.push({ key, error: e instanceof Error ? e.message : String(e) });
      }
    }

    const stats = { totalKeys: keys.length, migrated, alreadyHash, empty, oversized, failed };
    console.log(`Notes migration ${dryRun ? "(DRY RUN) " : ""}completed:`, JSON.stringify(stats));
    return NextResponse.json(
      { success: failed === 0, dryRun, stats, oversizedKeys, failures: failures.slice(0, 50) },
      { status: failed === 0 ? 200 : 500 },
    );
  } catch (error) {
    console.error("Notes migration failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCleanupRequest(request)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    success: true,
    message: "POST to migrate legacy note arrays to per-note hashes. Add ?dryRun=1 to preview.",
  });
}
