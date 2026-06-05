"use client";

import React, { useState, useCallback } from "react";
import {
  IconArrowRight,
  IconArrowLeft,
  IconArrowsExchange,
  IconCopy,
  IconMouse,
  IconX,
} from "@tabler/icons-react";

interface SplitToolbarProps {
  onFindInOther: (direction: "left" | "right") => void;
  onSyncScrollToggle: () => void;
  syncScroll: boolean;
  onCopyToOther: (direction: "left" | "right") => void;
  onSwap: () => void;
  onClose: () => void;
  hasSelection: boolean;
}

export default function SplitToolbar({
  onFindInOther,
  onSyncScrollToggle,
  syncScroll,
  onCopyToOther,
  onSwap,
  onClose,
  hasSelection,
}: SplitToolbarProps) {
  const btn = "p-1.5 rounded-[var(--radius-sm)] transition-colors text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] disabled:opacity-30 disabled:cursor-not-allowed";
  const activeBtnClass = "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]";

  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 hidden md:flex flex-col gap-0.5 p-1 bg-[var(--color-bg-elevated)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] shadow-lg">
      {/* Find in left note */}
      <button
        className={btn}
        onClick={() => onFindInOther("left")}
        disabled={!hasSelection}
        title="Find selected text in left note"
      >
        <IconArrowLeft size={14} />
      </button>

      {/* Find in right note */}
      <button
        className={btn}
        onClick={() => onFindInOther("right")}
        disabled={!hasSelection}
        title="Find selected text in right note"
      >
        <IconArrowRight size={14} />
      </button>

      <div className="h-px bg-[var(--color-border-secondary)] mx-0.5" />

      {/* Copy to left */}
      <button
        className={btn}
        onClick={() => onCopyToOther("left")}
        disabled={!hasSelection}
        title="Copy selected text to left note"
      >
        <IconCopy size={14} className="scale-x-[-1]" />
      </button>

      {/* Copy to right */}
      <button
        className={btn}
        onClick={() => onCopyToOther("right")}
        disabled={!hasSelection}
        title="Copy selected text to right note"
      >
        <IconCopy size={14} />
      </button>

      <div className="h-px bg-[var(--color-border-secondary)] mx-0.5" />

      {/* Sync scroll */}
      <button
        className={`${btn} ${syncScroll ? activeBtnClass : ""}`}
        onClick={onSyncScrollToggle}
        title={syncScroll ? "Unsync scrolling" : "Sync scrolling"}
      >
        <IconMouse size={14} />
      </button>

      {/* Swap panes */}
      <button
        className={btn}
        onClick={onSwap}
        title="Swap notes"
      >
        <IconArrowsExchange size={14} />
      </button>

      <div className="h-px bg-[var(--color-border-secondary)] mx-0.5" />

      {/* Close split */}
      <button
        className={`${btn} hover:text-[var(--color-danger)]`}
        onClick={onClose}
        title="Close split view"
      >
        <IconX size={14} />
      </button>
    </div>
  );
}

// Mobile version — horizontal
export function SplitToolbarMobile({
  onFindInOther,
  onSyncScrollToggle,
  syncScroll,
  onCopyToOther,
  onSwap,
  onClose,
  hasSelection,
}: SplitToolbarProps) {
  const btn = "p-1.5 rounded-[var(--radius-sm)] transition-colors text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] disabled:opacity-30 disabled:cursor-not-allowed";
  const activeBtnClass = "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]";

  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex md:hidden gap-0.5 p-1 bg-[var(--color-bg-elevated)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] shadow-lg">
      <button className={btn} onClick={() => onFindInOther("left")} disabled={!hasSelection} title="Find in top note">
        <IconArrowLeft size={14} className="rotate-90" />
      </button>
      <button className={btn} onClick={() => onFindInOther("right")} disabled={!hasSelection} title="Find in bottom note">
        <IconArrowRight size={14} className="rotate-90" />
      </button>
      <div className="w-px bg-[var(--color-border-secondary)] my-0.5" />
      <button className={btn} onClick={() => onCopyToOther("left")} disabled={!hasSelection} title="Copy to top">
        <IconCopy size={14} className="scale-x-[-1]" />
      </button>
      <button className={btn} onClick={() => onCopyToOther("right")} disabled={!hasSelection} title="Copy to bottom">
        <IconCopy size={14} />
      </button>
      <div className="w-px bg-[var(--color-border-secondary)] my-0.5" />
      <button className={`${btn} ${syncScroll ? activeBtnClass : ""}`} onClick={onSyncScrollToggle} title="Sync scroll">
        <IconMouse size={14} />
      </button>
      <button className={btn} onClick={onSwap} title="Swap">
        <IconArrowsExchange size={14} />
      </button>
      <div className="w-px bg-[var(--color-border-secondary)] my-0.5" />
      <button className={`${btn} hover:text-[var(--color-danger)]`} onClick={onClose} title="Close">
        <IconX size={14} />
      </button>
    </div>
  );
}
