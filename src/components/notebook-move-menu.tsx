"use client";

import React from "react";
import { Notebook } from "@/types/notebook";
import { getSortedNotebookTree } from "@/utils/notebook-tree";
import { getCoverPreviewStyle } from "@/lib/notebook-covers";
import { IconX, IconNotebook, IconFileOff } from "@tabler/icons-react";

interface NotebookMoveMenuProps {
  notebooks: Notebook[];
  currentNotebookId?: string | null;
  onMove: (notebookId: string | null) => void;
}

export default function NotebookMoveMenu({
  notebooks,
  currentNotebookId,
  onMove,
}: NotebookMoveMenuProps) {
  const entries = getSortedNotebookTree(notebooks, currentNotebookId);

  return (
    <>
      <button
        onClick={() => onMove(null)}
        className="w-full flex items-center gap-2 px-3 min-h-[44px] hover:bg-[var(--color-bg-secondary)] transition-colors text-left"
      >
        <IconFileOff size={14} className="text-[var(--color-text-tertiary)]" />
        <span className="text-sm text-[var(--color-text-primary)]">Remove from notebook</span>
      </button>
      {entries.length > 0 && <div className="h-px bg-[var(--color-border-secondary)]" />}
      <div className="max-h-48 overflow-y-auto">
        {entries.map(({ notebook, depth, isCurrent }) => {
          const previewStyle = getCoverPreviewStyle(
            notebook.coverType,
            notebook.coverValue
          );

          return (
            <button
              key={notebook.id}
              onClick={() => isCurrent ? onMove(null) : onMove(notebook.id)}
              className={`w-full flex items-center justify-between gap-2 min-h-[44px] hover:bg-[var(--color-bg-secondary)] transition-colors text-left ${
                isCurrent ? "opacity-70" : ""
              }`}
              style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: 12 }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isCurrent ? (
                  <IconX size={14} className="text-[var(--color-text-secondary)] flex-shrink-0" />
                ) : (
                  <div
                    className="w-4 h-4 rounded-sm flex-shrink-0"
                    style={previewStyle}
                  />
                )}
                <span className={`text-sm truncate ${isCurrent ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-primary)]"}`}>
                  {notebook.name}
                </span>
              </div>
              {isCurrent && (
                <span className="text-[10px] text-[var(--color-text-secondary)] flex-shrink-0">current</span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
