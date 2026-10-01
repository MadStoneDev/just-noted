"use client";

import React, { useState } from "react";
import { IconBell } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/hooks/use-notifications";
import type { NotificationView } from "@/lib/notifications";

function relTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-AU", { month: "short", day: "numeric" });
}

export default function NotificationBell({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { items, unread, markRead, markAll, clearAll } = useNotifications(enabled);

  if (!enabled) return null;

  const onItem = (n: NotificationView) => {
    if (!n.isRead) markRead(n.id);
    setOpen(false);
    if (n.href) router.push(n.href);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        aria-label="Notifications"
        className={`relative w-10 h-10 flex items-center justify-center rounded-[var(--radius-9)] transition-colors ${
          open
            ? "bg-[var(--color-accent-tint)] text-[var(--color-accent-text)]"
            : "text-[var(--color-ink-5)] hover:bg-[var(--color-raised-soft)] hover:text-[var(--color-ink-1)]"
        }`}
      >
        <IconBell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-semibold rounded-full bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-[calc(100%+8px)] bottom-0 z-50 w-[300px] max-h-[60vh] flex flex-col bg-[var(--color-panel-alt)] border border-[var(--color-hairline)] rounded-[12px] shadow-[0_24px_60px_rgba(0,0,0,.45)] overflow-hidden">
            <div className="flex items-center justify-between px-3 h-10 flex-none border-b border-[var(--color-hairline-soft)]">
              <span className="text-[13px] font-semibold text-[var(--color-ink-1)]">Notifications</span>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button onClick={() => markAll()} className="text-[11px] text-[var(--color-accent-text)] hover:underline">
                    Mark all read
                  </button>
                )}
                {items.length > 0 && (
                  <button onClick={() => clearAll()} className="text-[11px] text-[var(--color-ink-5)] hover:text-[var(--color-ink-2)]">
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {items.length === 0 ? (
                <div className="py-10 text-center text-[12px] text-[var(--color-ink-5)]">No notifications yet</div>
              ) : (
                <ul>
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        onClick={() => onItem(n)}
                        className={`w-full text-left px-3 py-2.5 border-b border-[var(--color-hairline-soft)] transition-colors hover:bg-[var(--color-raised-soft)] ${
                          n.isRead ? "" : "bg-[var(--color-accent-tint)]/30"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${n.isRead ? "bg-transparent" : "bg-[var(--color-accent-fill)]"}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] font-medium text-[var(--color-ink-1)]">{n.title}</p>
                            <p className="text-[12px] text-[var(--color-ink-4)] leading-snug break-words">{n.body}</p>
                            <p className="text-[10.5px] text-[var(--color-ink-6)] mt-0.5">{relTime(n.createdAt)}</p>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
