import { NextRequest, NextResponse } from "next/server";
import { getNotesRevision } from "@/utils/redis/note-store";

// The per-user notes revision counter, polled every 12s by use-notes-sync. As a
// Route Handler it runs concurrently instead of queued behind other server
// actions. No auth (matches the prior action — it's a cheap per-user Redis GET
// keyed by the id the client already holds).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ revision: 0 }, { status: 400 });
  try {
    const revision = await getNotesRevision(userId);
    return NextResponse.json({ revision: revision ?? 0 });
  } catch {
    return NextResponse.json({ revision: 0 }, { status: 500 });
  }
}
