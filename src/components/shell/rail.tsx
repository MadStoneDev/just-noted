"use client";

import React from "react";
import {
  IconFileText,
  IconBook,
  IconShare,
  IconSearch,
  IconHelp,
  IconAdjustmentsHorizontal,
  IconPlus,
} from "@tabler/icons-react";

export type RailView = "notes" | "notebooks" | "shared" | "search" | "settings";

interface RailProps {
  active: RailView;
  onNotes: () => void;
  onNotebooks: () => void;
  onShared: () => void;
  onSearch: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onNewNote: () => void;
  sharedNeedsAttention?: boolean;
}

function RailItem({
  label,
  active = false,
  badge = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  badge?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative flex justify-center">
      <button
        onClick={onClick}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className="relative flex h-10 w-10 items-center justify-center rounded-[var(--radius-9)] transition-colors duration-[var(--duration-fast)]"
        style={{
          backgroundColor: active ? "var(--color-accent-tint)" : "transparent",
          color: active ? "var(--color-accent-text)" : "var(--color-ink-4)",
        }}
      >
        {children}
        {badge && (
          <span
            className="absolute right-1.5 top-1.5 h-[7px] w-[7px] rounded-full"
            style={{ backgroundColor: "var(--color-warn)" }}
          />
        )}
      </button>

      {/* Active indicator — 2×22 bar on the rail's outer (left) edge */}
      {active && (
        <span
          className="pointer-events-none absolute left-0 top-1/2 h-[22px] w-[2px] -translate-y-1/2 rounded-[2px]"
          style={{ backgroundColor: "var(--color-accent-text)" }}
        />
      )}

      {/* Hover label — appears to the right after 400ms */}
      <span
        className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-6)] px-2 py-1 text-[11px] opacity-0 transition-opacity delay-[400ms] duration-100 group-hover:opacity-100"
        style={{
          backgroundColor: "var(--color-raised)",
          color: "var(--color-ink-2)",
          border: "1px solid var(--color-hairline)",
          fontFamily: "var(--font-ui)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

export default function Rail({
  active,
  onNotes,
  onNotebooks,
  onShared,
  onSearch,
  onSettings,
  onHelp,
  onNewNote,
  sharedNeedsAttention = false,
}: RailProps) {
  const iconProps = { size: 19, stroke: 1.5 } as const;

  return (
    <nav
      aria-label="Primary"
      className="hidden md:flex w-14 flex-shrink-0 flex-col items-center gap-1.5 py-3"
      style={{
        backgroundColor: "var(--color-panel)",
        borderRight: "1px solid var(--color-hairline)",
      }}
    >
      {/* Logo */}
      <div
        className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-7)] text-[12px] font-bold"
        style={{
          backgroundColor: "var(--color-accent-fill)",
          color: "var(--color-accent-on-fill)",
          fontFamily: "var(--font-ui)",
        }}
        aria-hidden
      >
        JN
      </div>

      <div className="h-[14px]" />

      <RailItem label="Notes" active={active === "notes"} onClick={onNotes}>
        <IconFileText {...iconProps} />
      </RailItem>
      <RailItem label="Notebooks" active={active === "notebooks"} onClick={onNotebooks}>
        <IconBook {...iconProps} />
      </RailItem>
      <RailItem
        label="Shared"
        active={active === "shared"}
        badge={sharedNeedsAttention}
        onClick={onShared}
      >
        <IconShare {...iconProps} />
      </RailItem>
      <RailItem label="Search" active={active === "search"} onClick={onSearch}>
        <IconSearch {...iconProps} />
      </RailItem>

      <div className="flex-1" />

      <RailItem label="Help" onClick={onHelp}>
        <IconHelp {...iconProps} />
      </RailItem>
      <RailItem label="Settings" active={active === "settings"} onClick={onSettings}>
        <IconAdjustmentsHorizontal {...iconProps} />
      </RailItem>

      {/* New note — the one filled accent action */}
      <div className="group relative mt-1 flex justify-center">
        <button
          onClick={onNewNote}
          aria-label="New note"
          className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-9)] transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
          style={{
            backgroundColor: "var(--color-accent-fill)",
            color: "var(--color-accent-on-fill)",
          }}
        >
          <IconPlus size={19} stroke={2} />
        </button>
        <span
          className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-6)] px-2 py-1 text-[11px] opacity-0 transition-opacity delay-[400ms] duration-100 group-hover:opacity-100"
          style={{
            backgroundColor: "var(--color-raised)",
            color: "var(--color-ink-2)",
            border: "1px solid var(--color-hairline)",
            fontFamily: "var(--font-ui)",
          }}
        >
          New note
        </span>
      </div>
    </nav>
  );
}
