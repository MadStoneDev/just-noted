"use client";

import React, { useRef, useState, useCallback } from "react";
import {
  IconNote,
  IconNotebook,
  IconShare,
  IconUser,
  IconChevronLeft,
  IconArrowsMinimize,
  IconDots,
  IconPlus,
  IconTrash,
  IconPin,
  IconPinnedOff,
} from "@tabler/icons-react";

export type MobileTab = "notes" | "notebooks" | "shared" | "you";

// Bottom tab bar — mobile primary navigation (design surface 08). Replaces the
// desktop rail on small screens. 78px incl. safe area, labels always visible.
export function MobileTabBar({
  active,
  onNotes,
  onNotebooks,
  onShared,
  onYou,
  sharedBadge = false,
}: {
  active: MobileTab;
  onNotes: () => void;
  onNotebooks: () => void;
  onShared: () => void;
  onYou: () => void;
  sharedBadge?: boolean;
}) {
  const tabs: { key: MobileTab; label: string; icon: React.ReactNode; onClick: () => void; badge?: boolean }[] = [
    { key: "notes", label: "Notes", icon: <IconNote size={22} />, onClick: onNotes },
    { key: "notebooks", label: "Notebooks", icon: <IconNotebook size={22} />, onClick: onNotebooks },
    { key: "shared", label: "Shared", icon: <IconShare size={22} />, onClick: onShared, badge: sharedBadge },
    { key: "you", label: "You", icon: <IconUser size={22} />, onClick: onYou },
  ];

  return (
    <nav
      aria-label="Primary"
      className="md:hidden flex-none flex items-stretch bg-[var(--color-panel)] border-t border-[var(--color-hairline)]"
      style={{
        height: "calc(58px + env(safe-area-inset-bottom))",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {tabs.map((t) => {
        const on = active === t.key;
        return (
          <button
            key={t.key}
            onClick={t.onClick}
            aria-current={on ? "page" : undefined}
            className="relative flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] transition-colors"
          >
            <span className={on ? "text-[var(--color-accent-text)]" : "text-[var(--color-ink-4)]"}>
              {t.icon}
              {t.badge && (
                <span className="absolute top-2.5 ml-3 -mt-0.5 inline-block w-2 h-2 rounded-full bg-[var(--color-warn)] ring-2 ring-[var(--color-panel)]" />
              )}
            </span>
            <span
              className={`text-[10.5px] leading-none ${
                on ? "text-[var(--color-accent-text)] font-medium" : "text-[var(--color-ink-5)]"
              }`}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// 48px editor nav bar — mobile (design surface 08). Back returns to the notes
// list; Focus / Share / ··· at 44×44.
export function MobileEditorNav({
  onBack,
  onFocus,
  onShare,
  onMore,
}: {
  onBack: () => void;
  onFocus: () => void;
  onShare: () => void;
  onMore?: () => void;
}) {
  return (
    <div className="md:hidden flex-none h-12 flex items-center justify-between pl-1 pr-1.5 border-b border-[var(--color-hairline-soft)] bg-[var(--color-canvas)]">
      <button
        onClick={onBack}
        className="h-11 pl-1 pr-2 flex items-center gap-0.5 text-[var(--color-ink-2)] active:opacity-60"
        aria-label="Back to notes"
      >
        <IconChevronLeft size={22} strokeWidth={2} />
        <span className="text-[15px]">Notes</span>
      </button>
      <div className="flex items-center">
        <button onClick={onFocus} aria-label="Focus mode" className="w-11 h-11 flex items-center justify-center text-[var(--color-ink-3)] active:opacity-60">
          <IconArrowsMinimize size={20} />
        </button>
        <button onClick={onShare} aria-label="Share" className="w-11 h-11 flex items-center justify-center text-[var(--color-ink-3)] active:opacity-60">
          <IconShare size={20} />
        </button>
        {onMore && (
          <button onClick={onMore} aria-label="More" className="w-11 h-11 flex items-center justify-center text-[var(--color-ink-3)] active:opacity-60">
            <IconDots size={20} />
          </button>
        )}
      </div>
    </div>
  );
}

// Swipeable note row — mobile (design surface 08). Swipe left reveals Delete;
// swipe right reveals Pin and Move; long-press enters multi-select. On desktop
// (no touch events) it renders inert, just the card.
const SWIPE_LEFT_W = 92; // Delete
const SWIPE_RIGHT_W = 148; // Pin + Move

export function SwipeableRow({
  children,
  isPinned,
  onDelete,
  onPin,
  onMove,
  onLongPress,
  disabled = false,
}: {
  children: React.ReactNode;
  isPinned: boolean;
  onDelete: () => void;
  onPin: () => void;
  onMove: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
}) {
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState<null | "left" | "right">(null);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<null | "x" | "y">(null);
  const moved = useRef(false);
  const longPressed = useRef(false);
  const lp = useRef<number | null>(null);

  const clearLp = () => { if (lp.current) { clearTimeout(lp.current); lp.current = null; } };
  const close = useCallback(() => { setOpen(null); setDx(0); }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
    axis.current = null;
    moved.current = false;
    longPressed.current = false;
    setDragging(false);
    clearLp();
    lp.current = window.setTimeout(() => {
      if (!moved.current && axis.current === null) {
        longPressed.current = true;
        onLongPress?.();
        if (navigator.vibrate) try { navigator.vibrate(8); } catch {}
      }
    }, 500);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (disabled || !start.current) return;
    const t = e.touches[0];
    const ddx = t.clientX - start.current.x;
    const ddy = t.clientY - start.current.y;
    if (axis.current === null) {
      if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;
      axis.current = Math.abs(ddx) > Math.abs(ddy) ? "x" : "y";
      clearLp();
      if (axis.current === "x") setDragging(true);
    }
    if (axis.current !== "x") return;
    moved.current = true;
    const base = open === "left" ? SWIPE_RIGHT_W : open === "right" ? -SWIPE_LEFT_W : 0;
    let next = base + ddx;
    next = Math.max(-SWIPE_LEFT_W - 16, Math.min(SWIPE_RIGHT_W + 16, next));
    setDx(next);
  };

  const onTouchEnd = () => {
    clearLp();
    setDragging(false);
    if (axis.current === "x") {
      if (dx <= -SWIPE_LEFT_W * 0.5) { setOpen("right"); setDx(-SWIPE_LEFT_W); }
      else if (dx >= SWIPE_RIGHT_W * 0.4) { setOpen("left"); setDx(SWIPE_RIGHT_W); }
      else close();
    }
    start.current = null;
  };

  // Suppress the tap-through that would open the note right after a swipe.
  const onClickCapture = (e: React.MouseEvent) => {
    if (moved.current || open || longPressed.current) {
      e.preventDefault();
      e.stopPropagation();
      moved.current = false;
      longPressed.current = false;
      if (open) close();
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-8)]" onClickCapture={onClickCapture}>
      {/* Pin + Move (revealed swiping right) */}
      <div className="absolute inset-y-0 left-0 flex items-stretch" style={{ width: SWIPE_RIGHT_W }} aria-hidden={open !== "left"}>
        <button
          onClick={() => { onPin(); close(); }}
          className="flex flex-col items-center justify-center gap-0.5 text-[var(--color-accent-text)] bg-[var(--color-accent-tint)]"
          style={{ width: SWIPE_RIGHT_W / 2 }}
        >
          {isPinned ? <IconPinnedOff size={19} /> : <IconPin size={19} />}
          <span className="text-[10.5px] font-medium">{isPinned ? "Unpin" : "Pin"}</span>
        </button>
        <button
          onClick={() => { onMove(); close(); }}
          className="flex flex-col items-center justify-center gap-0.5 text-[var(--color-ink-2)] bg-[var(--color-raised-soft)]"
          style={{ width: SWIPE_RIGHT_W / 2 }}
        >
          <IconNotebook size={19} />
          <span className="text-[10.5px] font-medium">Move</span>
        </button>
      </div>
      {/* Delete (revealed swiping left) */}
      <div className="absolute inset-y-0 right-0 flex items-stretch" style={{ width: SWIPE_LEFT_W }} aria-hidden={open !== "right"}>
        <button
          onClick={() => { onDelete(); close(); }}
          className="w-full flex flex-col items-center justify-center gap-0.5 text-[var(--color-danger)] bg-[var(--color-danger-subtle)]"
        >
          <IconTrash size={19} />
          <span className="text-[10.5px] font-medium">Delete</span>
        </button>
      </div>
      {/* Foreground */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className="relative bg-[var(--color-panel)]"
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? "none" : "transform 0.22s var(--ease-spring, ease)" }}
      >
        {children}
      </div>
    </div>
  );
}

// Floating "new note" button on the notes list — mobile (design surface 08).
// 56×56, 18px from the right, clears the tab bar.
export function MobileFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="New note"
      className="md:hidden fixed right-[18px] z-40 w-14 h-14 rounded-full flex items-center justify-center shadow-[var(--shadow-lg)] active:scale-95 transition-transform"
      style={{
        bottom: "calc(94px + env(safe-area-inset-bottom))",
        backgroundColor: "var(--color-accent-fill)",
        color: "var(--color-accent-on-fill)",
      }}
    >
      <IconPlus size={26} strokeWidth={2.2} />
    </button>
  );
}
