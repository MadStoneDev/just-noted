import { NextRequest, NextResponse } from "next/server";
import { loadNotifications } from "@/lib/notifications-access";

// Notifications read as a Route Handler (not a server action) so it runs
// concurrently instead of queued. One getUser(); RLS-scoped cookie client.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("limit");
  const parsed = raw ? parseInt(raw, 10) : 20;
  const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 20;
  try {
    const { items, unread } = await loadNotifications(limit);
    return NextResponse.json({ items, unread });
  } catch {
    return NextResponse.json({ items: [], unread: 0 }, { status: 500 });
  }
}
