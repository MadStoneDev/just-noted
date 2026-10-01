"use server";

import { createClient } from "@/utils/supabase/server";
import { renderNotification, type NotificationRow, type NotificationView } from "@/lib/notifications";

/** The viewer's recent notifications (RLS scopes to their own). */
export async function getNotifications(limit = 20): Promise<NotificationView[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("notifications")
    .select("id, type, actor_id, note_id, data, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data as NotificationRow[]) || []).map(renderNotification);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() } as any)
    .eq("id", id)
    .eq("user_id", user.id)
    .is("read_at", null);
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() } as any)
    .eq("user_id", user.id)
    .is("read_at", null);
}

export async function clearAllNotifications(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("notifications").delete().eq("user_id", user.id);
}
