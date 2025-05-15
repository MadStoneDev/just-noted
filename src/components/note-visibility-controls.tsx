// components/note-visibility-controls.tsx
"use client";

import React from "react";
import { IconFoldDown, IconFoldUp } from "@tabler/icons-react";

interface NoteVisibilityControlsProps {
  hasCollapsedNotes: boolean;
  hasExpandedNotes: boolean;
  onCollapseAll: () => void;
  onExpandAll: () => void;
}

export function NoteVisibilityControls({
  hasCollapsedNotes,
  hasExpandedNotes,
  onCollapseAll,
  onExpandAll,
}: NoteVisibilityControlsProps) {
  // Only render if we have notes
  if (!hasCollapsedNotes && !hasExpandedNotes) {
    return null;
  }

  return (
    <div className="flex space-x-2">
      {/* Show Collapse All if there are any expanded notes */}
      {hasExpandedNotes && (
        <button
          type="button"
          onClick={onCollapseAll}
          className="px-2 py-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-mercedes-primary hover:bg-mercedes-lighter transition-all duration-300 ease-in-out"
          title="Collapse all notes"
        >
          <IconFoldUp size={20} strokeWidth={1.5} />
          <span>Collapse All</span>
        </button>
      )}

      {/* Show Expand All if there are any collapsed notes */}
      {hasCollapsedNotes && (
        <button
          type="button"
          onClick={onExpandAll}
          className="px-2 py-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-mercedes-primary hover:bg-mercedes-lighter transition-all duration-300 ease-in-out"
          title="Expand all notes"
        >
          <IconFoldDown size={20} strokeWidth={1.5} />
          <span>Expand All</span>
        </button>
      )}
    </div>
  );
}
