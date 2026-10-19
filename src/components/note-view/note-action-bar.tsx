"use client";

import React from "react";
import {
  IconHelp,
  IconMessageCircle,
  IconHistory,
  IconLink,
  IconViewportWide,
  IconMarkdown,
  IconX,
} from "@tabler/icons-react";

// Shared, context-conditioned note action bar used by both the shared-note
// surface (NoteView) and the owner editor (NoteEditor). `isShared` drives the
// subtle teal tell (tinted bar + teal control colours); surface-specific
// controls come in via `left`, `extras` and `overflow`.

/**
 * Per-control classes: teal when shared, neutral otherwise. No display or width —
 * callers prefix `flex w-8` (icon button) or `hidden md:flex px-2` (wide), so the
 * display class never collides with the colour classes here.
 */
export function barButtonClass(isShared: boolean): string {
  return `h-8 items-center justify-center rounded-[var(--radius-6)] transition-colors ${
    isShared
      ? "text-[var(--color-accent-text)] hover:bg-[var(--color-accent-tint-border)]"
      : "text-[var(--color-ink-5)] hover:bg-[var(--color-raised-soft)]"
  }`;
}

interface NoteActionBarProps {
  isShared: boolean;
  /** Root display/visibility classes. Owner passes "print:hidden hidden md:flex"; shared defaults to "flex". */
  className?: string;
  /** Left cluster (shared context label, or owner storage pill + Saving). */
  left?: React.ReactNode;
  /** Presence avatars (shared). */
  presence?: React.ReactNode;
  onHelp: () => void;
  chat?: { onOpen: () => void; unread: number };
  onHistory?: () => void;
  onCopyLink?: () => void;
  wide?: { isWide: boolean; tooltip: string; onCycle: () => void; label?: string };
  markdown?: { viewMode: "rendered" | "source"; onToggle: () => void };
  onClose?: () => void;
  /** Surface-specific right-cluster controls, before the overflow. */
  extras?: React.ReactNode;
  /** The "…" control/menu (surface-specific). */
  overflow?: React.ReactNode;
}

export default function NoteActionBar({
  isShared,
  className = "flex",
  left,
  presence,
  onHelp,
  chat,
  onHistory,
  onCopyLink,
  wide,
  markdown,
  onClose,
  extras,
  overflow,
}: NoteActionBarProps) {
  const btn = barButtonClass(isShared);
  return (
    <div
      className={`${className} items-center justify-between gap-3 px-4 md:px-8 min-h-[44px] py-1.5 flex-none border-b ${
        isShared
          ? "bg-[var(--color-accent-tint)] border-[var(--color-accent-tint-border)]"
          : "bg-[var(--color-canvas)] border-[var(--color-hairline)]"
      }`}
    >
      <div className="min-w-0">{left}</div>

      <div className="flex items-center gap-1.5 shrink-0">
        {presence}

        <button onClick={onHelp} title="Formatting help" className={`flex w-8 ${btn}`}>
          <IconHelp size={16} />
        </button>

        {chat && (
          <button onClick={chat.onOpen} title="Chat" className={`relative flex w-8 ${btn}`}>
            <IconMessageCircle size={16} />
            {chat.unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] text-[9px] font-semibold flex items-center justify-center">
                {chat.unread > 9 ? "9+" : chat.unread}
              </span>
            )}
          </button>
        )}

        {onHistory && (
          <button onClick={onHistory} title="Version history" className={`flex w-8 ${btn}`}>
            <IconHistory size={16} />
          </button>
        )}

        {onCopyLink && (
          <button onClick={onCopyLink} title="Copy link" className={`flex w-8 ${btn}`}>
            <IconLink size={16} />
          </button>
        )}

        {wide && (
          <button
            onClick={wide.onCycle}
            title={wide.tooltip}
            className={`hidden md:flex gap-1 ${wide.label ? "px-2" : "w-8"} ${btn} ${
              wide.isWide && !isShared ? "text-[var(--color-accent)]" : ""
            }`}
          >
            <IconViewportWide size={16} />
            {wide.label && <span className="text-[11px] font-medium leading-none">{wide.label}</span>}
          </button>
        )}

        {markdown && (
          <button
            onClick={markdown.onToggle}
            title={markdown.viewMode === "rendered" ? "View markdown source" : "View formatted"}
            className={`flex w-8 ${btn} ${markdown.viewMode === "source" && !isShared ? "text-[var(--color-accent)]" : ""}`}
          >
            <IconMarkdown size={16} />
          </button>
        )}

        {extras}
        {overflow}

        {onClose && (
          <button onClick={onClose} title="Close" className={`flex w-8 ${btn}`}>
            <IconX size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
