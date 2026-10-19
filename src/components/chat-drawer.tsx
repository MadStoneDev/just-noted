"use client";

import React, { useEffect, useRef, useState } from "react";
import { IconMessageCircle } from "@tabler/icons-react";
import NoteChatPanel from "@/components/note-chat-panel";
import { useChatUnread } from "@/hooks/use-chat-unread";

/**
 * Chat as a right-edge sliding drawer with a circular toggle handle, instead of
 * a docked side column. Render it inside a `relative` container that spans the
 * note's content region (below the action bar): the drawer fills that height and
 * the handle vertically centres within it.
 *
 * Geometry: the handle is centred on the drawer's LEFT edge and rides it — when
 * open it straddles the edge (half over the pane, half over the note); when
 * closed the drawer is off-screen right and the handle peeks at the right edge.
 * On phones the open drawer is full-width and is closed via the panel's own X,
 * so the handle hides while open.
 */
export default function ChatDrawer({ noteId, enabled }: { noteId: string; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  // Keep the panel mounted briefly after close so the slide-out can animate
  // (NoteChatPanel renders null when open=false).
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
    <div
      className={`absolute top-0 right-0 bottom-0 z-10 w-full lg:w-[340px] transition-transform duration-[var(--duration-slow)] ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {mounted && <NoteChatPanel noteId={noteId} open={open} onClose={() => setOpen(false)} />}

      {/* Circular handle — centred on the drawer's left edge so it rides the
          edge as the drawer slides. Hidden on phones while open (the full-width
          panel covers it; close via the panel's X). */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Open chat"}
        title="Chat"
        className={`absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full items-center justify-center shadow-[var(--shadow-md)] border transition-colors ${
          open
            ? "hidden lg:flex bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] border-[var(--color-accent-fill)]"
            : "flex bg-[var(--color-raised)] text-[var(--color-ink-3)] border-[var(--color-hairline)] hover:text-[var(--color-ink-1)]"
        }`}
      >
        <IconMessageCircle size={18} />
        {!open && unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-0.5 rounded-full bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] text-[9px] font-semibold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}
