import { NextRequest, NextResponse } from "next/server";
import { processExport } from "@/utils/account/export-runner";

export const dynamic = "force-dynamic";

// QStash delivers the job here. Auth is a shared secret header (EXPORT_JOB_SECRET)
// that the publisher sets — matching the cleanup-cron convention. The payload
// carries only an export id; all content is gathered server-side.
function authorized(req: NextRequest): boolean {
  const secret = process.env.EXPORT_JOB_SECRET;
  if (!secret) return false;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let exportId: string | undefined;
  try {
    const body = await req.json();
    exportId = typeof body?.exportId === "string" ? body.exportId : undefined;
  } catch {
    /* fall through */
  }
  if (!exportId) return NextResponse.json({ error: "Missing exportId" }, { status: 400 });

  const result = await processExport(exportId);
  return NextResponse.json({ success: result.ok }, { status: result.ok ? 200 : 500 });
}
