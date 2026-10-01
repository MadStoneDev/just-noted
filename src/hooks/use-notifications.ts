"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  clearAllNotifications,
} from "@/app/actions/notificationActions";
import type { NotificationView } from "@/lib/notifications";

export function useNotifications(enabled: boolean) {
  const [items, setItems] = useState<NotificationView[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!enabled) { setItems([]); setUnread(0); return; }
    try {
      const [list, count] = await Promise.all([getNotifications(), getUnreadNotificationCount()]);
      setItems(list);
      setUnread(count);
    } catch {
      /* keep last */
    }
  }, [enabled]);

  useEffect(() => { load(); }, [load]);

  // Realtime: RLS scopes the stream to this user's rows, so no filter needed.
  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    const channel = supabase
      .channel("notifications-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [enabled, load]);

  const markRead = useCallback(async (id: string) => { await markNotificationRead(id); load(); }, [load]);
  const markAll = useCallback(async () => { await markAllNotificationsRead(); load(); }, [load]);
  const clearAll = useCallback(async () => { await clearAllNotifications(); load(); }, [load]);

  return { items, unread, reload: load, markRead, markAll, clearAll };
}
