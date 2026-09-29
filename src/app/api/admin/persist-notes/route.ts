import { NextRequest, NextResponse } from "next/server";
import { persistNoteKeys } from "@/utils/redis/persistNotes";
import { isAuthorizedCleanupRequest } from "@/lib/admin-cleanup-auth";

/**
 * One-off migration endpoint: strip the legacy TTL from existing `notes:*` keys.
 *
 *   POST /api/admin/persist-notes?dryRun=1   → count keys that still have a TTL
 *   POST /api/admin/persist-notes            → actually PERSIST them
 *
 * Guarded by the same x-api-key as the cleanup job. Run the dry-run first.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCleanupRequest(request)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const dryRun =
    request.nextUrl.searchParams.get("dryRun") === "1" ||
    request.nextUrl.searchParams.get("dryRun") === "true";

  const result = await persistNoteKeys({ dryRun });
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCleanupRequest(request)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    success: true,
    message: "POST here to remove legacy TTLs from notes:* keys. Add ?dryRun=1 to count first.",
  });
}
