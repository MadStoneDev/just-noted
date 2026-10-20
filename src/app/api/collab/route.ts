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
    return NextResponse.json({ state: null }, { status: 400 });
  }
  try {
    const { state } = await loadCollabState({ shortcode, noteId });
    return NextResponse.json({ state });
  } catch {
    return NextResponse.json({ state: null }, { status: 500 });
  }
}
