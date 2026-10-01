"use client";

import React from "react";
import { useRouter } from "next/navigation";
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

// The notifications panel for the sidebar's content column — a peer of the
// Notes / Notebooks / Shared views (it replaces each other, never overlays).
// The notifications data + mutations live in the sidebar's single
// useNotifications() instance; this component only renders and navigates.
export default function NotificationsNavList({
  items,
  onRead,
  onNavigate,
}: {
  items: NotificationView[];
  onRead: (id: string) => void;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  const onItem = (n: NotificationView) => {
    if (!n.isRead) onRead(n.id);
    if (n.href) {
      router.push(n.href);
      onNavigate?.();
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="py-16 text-center text-[13px] text-[var(--color-ink-5)]">
          No notifications yet
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <ul>
        {items.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => onItem(n)}
              className={`w-full text-left px-3 py-3 border-b border-[var(--color-hairline-soft)] transition-colors hover:bg-[var(--color-raised-soft)] ${
                n.isRead ? "" : "bg-[var(--color-accent-tint)]/30"
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                    n.isRead ? "bg-transparent" : "bg-[var(--color-accent-fill)]"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[var(--color-ink-1)]">{n.title}</p>
                  <p className="text-[12px] text-[var(--color-ink-4)] leading-snug break-words">{n.body}</p>
                  <p className="text-[10.5px] text-[var(--color-ink-6)] mt-0.5">{relTime(n.createdAt)}</p>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
