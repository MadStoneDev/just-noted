import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getChatUnreadFor } from "@/lib/chat-access";

// Chat unread count as a Route Handler (fires on mount + on every realtime
// message change) so it runs concurrently instead of queued. One getUser() for
// the id; access is still gated server-side by isParticipant inside the lib.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const noteId = req.nextUrl.searchParams.get("noteId");
  if (!noteId) return NextResponse.json({ unread: 0 }, { status: 400 });
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ unread: 0 });
    const unread = await getChatUnreadFor(noteId, user.id);
    return NextResponse.json({ unread });
  } catch {
    return NextResponse.json({ unread: 0 }, { status: 500 });
  }
}
