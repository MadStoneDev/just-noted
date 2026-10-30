"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { IconX } from "@tabler/icons-react";
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

interface NotificationsViewProps {
  items: NotificationView[];
  unread: number;
  onRead: (id: string) => void;
  onMarkAll: () => void;
  onClearAll: () => void;
  onClose: () => void;
}

// Notifications as a real main-area view (like Trash) — selecting Notifications
// in the rail opens it here, not in the sidebar. The notifications data +
// mutations live in NoteWrapper's single useNotifications() instance (shared
// with the rail badge); this component only renders and navigates.
export default function NotificationsView({
  items,
  unread,
  onRead,
  onMarkAll,
  onClearAll,
  onClose,
}: NotificationsViewProps) {
  const router = useRouter();

  const onItem = (n: NotificationView) => {
    if (!n.isRead) onRead(n.id);
    if (n.href) {
      router.push(n.href);
      onClose();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-[760px] px-6 md:px-10 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="font-[family-name:var(--font-editor)] text-[34px] leading-[1.05] font-medium tracking-[-0.01em] text-[var(--color-ink)]">
              Notifications
            </h1>
            <p className="mt-1.5 text-[11.5px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
              {items.length === 0
                ? "You're all caught up"
                : `${items.length} notification${items.length !== 1 ? "s" : ""}${unread > 0 ? ` · ${unread} unread` : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button
                onClick={onMarkAll}
                className="h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
              >
                Mark all read
              </button>
            )}
            {items.length > 0 && (
              <button
                onClick={onClearAll}
                className="h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close notifications"
              className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-7)] text-[var(--color-ink-4)] hover:bg-[var(--color-raised-soft)] hover:text-[var(--color-ink-1)] transition-colors"
            >
              <IconX size={16} />
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-24 max-w-[320px] mx-auto">
            <h2 className="font-[family-name:var(--font-editor)] text-[24px] font-medium text-[var(--color-ink)]">
              Nothing new
            </h2>
            <p className="mt-2 text-[13.5px] leading-[1.55] text-[var(--color-ink-4)]">
              When someone shares a note, comments, or edits a shared note,
              you'll see it here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => onItem(n)}
                  className={`w-full text-left px-4 py-3.5 rounded-[var(--radius-9)] border transition-colors ${
                    n.isRead
                      ? "border-transparent hover:bg-[var(--color-raised-soft)]"
                      : "border-[var(--color-accent-tint-border)] bg-[var(--color-accent-tint)] hover:opacity-90"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                        n.isRead ? "bg-transparent" : "bg-[var(--color-accent-fill)]"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-[var(--color-ink-1)]">{n.title}</p>
                      <p className="text-[12.5px] text-[var(--color-ink-4)] leading-snug break-words">{n.body}</p>
                      <p className="text-[10.5px] text-[var(--color-ink-6)] mt-1">{relTime(n.createdAt)}</p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
