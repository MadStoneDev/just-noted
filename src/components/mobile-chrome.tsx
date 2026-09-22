"use client";

import React from "react";
import {
  IconNote,
  IconNotebook,
  IconShare,
  IconUser,
  IconChevronLeft,
  IconArrowsMinimize,
  IconDots,
  IconPlus,
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
