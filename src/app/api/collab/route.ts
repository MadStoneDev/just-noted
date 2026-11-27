import { NextRequest, NextResponse } from "next/server";
import { loadCollabState } from "@/lib/collab-access";

// Collab-doc READ as a Route Handler (not a server action): server actions run
// one-at-a-time in Next.js, so loading the Yjs doc as an action stalls behind
// every other action in flight when a note opens. A plain fetch runs
// concurrently. Access is still enforced server-side from the session.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const shortcode = req.nextUrl.searchParams.get("shortcode") || undefined;
  const noteId = req.nextUrl.searchParams.get("noteId") || undefined;
  if (!shortcode && !noteId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    const r = await loadCollabState({ shortcode, noteId });
    if (!r.ok) return NextResponse.json({ ok: false }, { status: r.reason === "forbidden" ? 403 : 500 });
    // ok + state null = no doc yet (the client may seed); see CollabLoad.
    return NextResponse.json({ ok: true, state: r.state });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
