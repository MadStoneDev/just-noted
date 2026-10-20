import type { NotificationView } from "@/lib/notifications";

// Client loader for notifications — hits /api/notifications (plain fetch) so it
// runs concurrently instead of queued behind other server actions.
export async function fetchNotifications(
  limit?: number,
): Promise<{ items: NotificationView[]; unread: number }> {
  try {
    const res = await fetch(`/api/notifications${limit ? `?limit=${limit}` : ""}`, {
      cache: "no-store",
    });
    if (!res.ok) return { items: [], unread: 0 };
    const data = await res.json();
    return { items: (data?.items as NotificationView[]) ?? [], unread: (data?.unread as number) ?? 0 };
  } catch {
    return { items: [], unread: 0 };
  }
}
