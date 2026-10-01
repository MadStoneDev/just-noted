import { NextRequest, NextResponse } from "next/server";
import { cleanupOldNotes } from "@/utils/redis/redisCleanup";
import { purgeExpiredTrash } from "@/utils/supabase/trashCleanup";
import { purgeDueAccounts, purgeOldDeletionRecords } from "@/utils/account/purge-account";
import { purgeExpiredExports } from "@/utils/account/export-runner";
import { purgeOldNotifications } from "@/utils/notifications/create";
import { isAuthorizedCleanupRequest } from "@/lib/admin-cleanup-auth";

export async function POST(request: NextRequest) {
  if (!isAuthorizedCleanupRequest(request)) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    // Dry run (?dryRun=1): report what the Redis cleanup WOULD delete without
    // deleting anything, and skip the trash purge entirely.
    const dryRun =
      request.nextUrl.searchParams.get("dryRun") === "1" ||
      request.nextUrl.searchParams.get("dryRun") === "true";

    if (dryRun) {
      const redis = await cleanupOldNotes({ dryRun: true });
      return NextResponse.json(
        { success: redis.success, dryRun: true, redis, trash: { skipped: true } },
        { status: redis.success ? 200 : 500 },
      );
    }

    // Run both cleanup operations: inactive Redis (guest) notes, and Supabase
    // soft-deleted notes past the physical retention cutoff. The Redis cleanup
    // is itself env-gated (REDIS_CLEANUP_ENABLED) and no-ops unless enabled.
    const [redis, trash, accounts, exports, notifications, deletionRecords] = await Promise.all([
      cleanupOldNotes(),
      purgeExpiredTrash(),
      purgeDueAccounts(),
      purgeExpiredExports(),
      purgeOldNotifications(),
      purgeOldDeletionRecords(),
    ]);

    const success =
      redis.success && trash.success && accounts.success && exports.success &&
      notifications.success && deletionRecords.success;
    return NextResponse.json({ success, redis, trash, accounts, exports, notifications, deletionRecords }, {
      status: success ? 200 : 500,
    });
  } catch (error) {
    console.error("Error in cleanup endpoint:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Server error during cleanup",
        error: String(error),
      },
      { status: 500 },
    );
  }
}

// Optionally add a GET handler for testing purposes
export async function GET(request: NextRequest) {
  if (!isAuthorizedCleanupRequest(request)) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    success: true,
    message:
      "Cleanup endpoint is active. Send a POST request to run the cleanup.",
  });
}
