// components/collapse-all-button.tsx
"use client";

import React from "react";
import { IconFoldDown, IconFoldUp } from "@tabler/icons-react";

interface CollapseAllButtonProps {
  areAllNotesCollapsed: boolean;
  onToggleAll: () => void;
}

export function CollapseAllButton({
  areAllNotesCollapsed,
  onToggleAll,
}: CollapseAllButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggleAll}
      className="px-2 py-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-mercedes-primary hover:bg-mercedes-lighter transition-all duration-300 ease-in-out"
      title={areAllNotesCollapsed ? "Expand all notes" : "Collapse all notes"}
    >
      {areAllNotesCollapsed ? (
        <>
          <IconFoldDown size={20} strokeWidth={1.5} />
          <span>Expand All</span>
        </>
      ) : (
        <>
          <IconFoldUp size={20} strokeWidth={1.5} />
          <span>Collapse All</span>
        </>
      )}
    </button>
  );
}
