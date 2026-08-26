"use client";

import React from "react";
import { Notebook } from "@/types/notebook";
import { getSortedNotebookTree } from "@/utils/notebook-tree";
import { getCoverPreviewStyle } from "@/lib/notebook-covers";
import { IconFileOff, IconCheck } from "@tabler/icons-react";

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
    <div className="py-1">
      {/* Section label — gives the list context instead of a bare action */}
      <div className="px-3 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
        Move to notebook
      </div>

      {/* Remove from notebook — disabled when the note isn't in one */}
      <button
        onClick={() => onMove(null)}
        disabled={!currentNotebookId}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--color-bg-secondary)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <IconFileOff
          size={16}
          className="text-[var(--color-text-tertiary)] flex-shrink-0"
        />
        <span className="text-sm text-[var(--color-text-primary)]">
          Remove from notebook
        </span>
      </button>

      {/* Separator under "Remove from notebook" */}
      <div className="my-1 h-px bg-[var(--color-border-secondary)]" />

      {/* Notebook list */}
      {entries.length > 0 ? (
        <div className="max-h-56 overflow-y-auto scrollbar-thin">
          {entries.map(({ notebook, depth, isCurrent }) => {
            const previewStyle = getCoverPreviewStyle(
              notebook.coverType,
              notebook.coverValue,
            );

            return (
              <button
                key={notebook.id}
                onClick={() => {
                  if (!isCurrent) onMove(notebook.id);
                }}
                aria-current={isCurrent || undefined}
                className={`w-full flex items-center justify-between gap-2 py-2 text-left transition-colors ${
                  isCurrent
                    ? "bg-[var(--color-selected)] cursor-default"
                    : "hover:bg-[var(--color-bg-secondary)]"
                }`}
                style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: 12 }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-4 h-4 rounded-[var(--radius-sm)] flex-shrink-0 ring-1 ring-inset ring-[var(--color-border-secondary)]"
                    style={previewStyle}
                  />
                  <span
                    className={`text-sm truncate ${
                      isCurrent
                        ? "text-[var(--color-accent)] font-medium"
                        : "text-[var(--color-text-primary)]"
                    }`}
                  >
                    {notebook.name}
                  </span>
                </div>
                {isCurrent && (
                  <IconCheck
                    size={16}
                    className="text-[var(--color-accent)] flex-shrink-0"
                  />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="px-3 py-2 text-sm text-[var(--color-text-tertiary)]">
          No notebooks yet
        </div>
      )}
    </div>
  );
}
