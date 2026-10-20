import { createClient } from "@/utils/supabase/server";
import { renderNotification, type NotificationRow, type NotificationView } from "@/lib/notifications";

// Notifications read, as a plain module (not "use server") so the Route Handler
// can call it. One getUser() + both queries (list + unread count) in parallel,
// using the cookie/RLS client scoped to the authed user.
export async function loadNotifications(
  limit = 20,
): Promise<{ items: NotificationView[]; unread: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { items: [], unread: 0 };

  const [listRes, countRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, actor_id, note_id, data, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
  ]);

  const items = ((listRes.data as NotificationRow[]) || []).map(renderNotification);
  return { items, unread: countRes.count ?? 0 };
}
