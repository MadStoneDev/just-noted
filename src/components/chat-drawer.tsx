"use client";

import React, { useEffect, useRef, useState } from "react";
import { IconMessageCircle } from "@tabler/icons-react";
import NoteChatPanel from "@/components/note-chat-panel";
import { useChatUnread } from "@/hooks/use-chat-unread";

/**
 * Chat that SHARES screen space with the note on desktop — the note column
 * shrinks and the chat sits beside it, both open and interactive at once — and
 * is a full-width overlay only on mobile. A circular handle rides the note|chat
 * boundary and toggles it.
 *
 * Render it as the last child of the note's content region, which must be a
 * `relative flex ... overflow-hidden` ROW whose note part is `flex-1` (so the
 * note shrinks when the chat column takes its width).
 */
export default function ChatDrawer({ noteId, enabled }: { noteId: string; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  // Keep the panel mounted briefly after close so the collapse/slide-out can
  // animate (NoteChatPanel renders null when its open is false).
  const [mounted, setMounted] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { unread } = useChatUnread(enabled ? noteId : null, enabled && !open);

  useEffect(() => {
    if (open) {
      if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
      setMounted(true);
    } else if (mounted) {
      closeTimer.current = setTimeout(() => setMounted(false), 300);
    }
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, [open, mounted]);

  // A different note resets the drawer.
  useEffect(() => { setOpen(false); }, [noteId]);

  if (!enabled) return null;

  return (
    <>
      {/* Chat column. Mobile: full-width overlay (z above the toolbar), slides in.
          Desktop: in-flow (lg:static) with width animating 0↔340, so the note
          column's flex-1 shrinks/grows beside it. overflow-hidden clips the
          panel's own fixed-width aside while the column collapses. */}
      <div
        className={`shrink-0 overflow-hidden transition-all duration-[var(--duration-slow)] absolute inset-y-0 right-0 z-30 w-full lg:static lg:z-auto lg:translate-x-0 ${
          open ? "translate-x-0 lg:w-[340px]" : "translate-x-full lg:w-0"
        }`}
      >
        {mounted && <NoteChatPanel noteId={noteId} open={mounted} onClose={() => setOpen(false)} />}
      </div>

      {/* Circular handle — rides the note|chat boundary. Closed: peeks at the
          region's right edge. Open (desktop): centred on the 340px boundary.
          Hidden on phones while open (full-width panel covers it; close via its X). */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Open chat"}
        title="Chat"
        className={`absolute top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full items-center justify-center shadow-[var(--shadow-md)] border transition-[right,transform,background-color,color] duration-[var(--duration-slow)] ${
          open
            ? "right-0 lg:right-[340px] translate-x-1/2 hidden lg:flex bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] border-[var(--color-accent-fill)]"
            : "right-[10px] translate-x-0 flex bg-[var(--color-raised)] text-[var(--color-ink-3)] border-[var(--color-hairline)] hover:text-[var(--color-ink-1)]"
        }`}
      >
        <IconMessageCircle size={18} />
        {!open && unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-0.5 rounded-full bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] text-[9px] font-semibold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </>
  );
}
