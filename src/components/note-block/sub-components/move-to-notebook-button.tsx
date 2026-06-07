"use client";

import React, { useState, useRef, useEffect } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { assignNoteToNotebook } from "@/app/actions/notebookActions";
import { getCoverPreviewStyle } from "@/lib/notebook-covers";
import { getSortedNotebookTree } from "@/utils/notebook-tree";
import {
  IconNotebook,
  IconCheck,
  IconFileOff,
  IconLoader2,
} from "@tabler/icons-react";

interface MoveToNotebookButtonProps {
  noteId: string;
  currentNotebookId: string | null | undefined;
  isPrivate: boolean;
  onMoved?: (notebookId: string | null) => void;
}

export default function MoveToNotebookButton({
  noteId,
  currentNotebookId,
  isPrivate,
  onMoved,
}: MoveToNotebookButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { notebooks, optimisticUpdateNote, recalculateNotebookCounts } = useNotesStore();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleMove = async (notebookId: string | null) => {
    if (notebookId === currentNotebookId) {
      setIsOpen(false);
      return;
    }

    setIsMoving(true);

    // Optimistic update
    optimisticUpdateNote(noteId, { notebookId });

    try {
      const result = await assignNoteToNotebook(noteId, notebookId);

      if (result.success) {
        recalculateNotebookCounts();
        onMoved?.(notebookId);
      } else {
        // Revert on failure
        optimisticUpdateNote(noteId, { notebookId: currentNotebookId });
        console.error("Failed to move note:", result.error);
      }
    } catch (error) {
      // Revert on error
      optimisticUpdateNote(noteId, { notebookId: currentNotebookId });
      console.error("Failed to move note:", error);
    } finally {
      setIsMoving(false);
      setIsOpen(false);
    }
  };

  // Don't show if no notebooks exist
  if (notebooks.length === 0) {
    return null;
  }

  const currentNotebook = currentNotebookId
    ? notebooks.find((nb) => nb.id === currentNotebookId)
    : null;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isMoving}
        title={currentNotebook ? `In: ${currentNotebook.name}` : "Move to notebook"}
        aria-label={currentNotebook ? `In: ${currentNotebook.name}` : "Move to notebook"}
        className={`group/notebook px-2 cursor-pointer flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 w-fit min-w-[44px] h-[44px] rounded-[var(--radius-lg)] border-1 ${
          isPrivate
            ? "border-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-text-inverse)]"
            : "border-[var(--color-border-primary)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]"
        } text-[var(--color-text-primary)] overflow-hidden transition-all duration-300 ease-in-out disabled:opacity-50`}
      >
        {isMoving ? (
          <IconLoader2 size={20} strokeWidth={2} className="animate-spin" />
        ) : currentNotebook ? (
          <div
            className="w-5 h-5 rounded flex-shrink-0"
            style={getCoverPreviewStyle(
              currentNotebook.coverType,
              currentNotebook.coverValue
            )}
          />
        ) : (
          <IconNotebook size={20} strokeWidth={2} />
        )}
        <span
          className={`w-fit max-w-0 sm:group-hover/notebook:max-w-52 opacity-0 md:group-hover/notebook:opacity-100 overflow-hidden transition-all duration-300 ease-in-out whitespace-nowrap`}
        >
          {currentNotebook ? currentNotebook.name : "Notebook"}
        </span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] border border-[var(--color-border-primary)] z-50 min-w-48 max-w-[calc(100vw-2rem)] overflow-hidden">
          {/* Remove from notebook option */}
          {currentNotebookId && (
            <>
              <button
                onClick={() => handleMove(null)}
                className="w-full flex items-center gap-2 px-3 min-h-[44px] hover:bg-[var(--color-bg-secondary)] transition-colors text-left"
              >
                <IconFileOff size={16} className="text-[var(--color-text-secondary)]" />
                <span className="text-sm text-[var(--color-text-primary)]">Remove from notebook</span>
              </button>
              <div className="border-t border-[var(--color-border-primary)]" />
            </>
          )}

          {/* Notebooks list */}
          <div className="max-h-48 overflow-y-auto">
            {getSortedNotebookTree(notebooks, currentNotebookId).map(({ notebook, depth }) => {
              const isSelected = notebook.id === currentNotebookId;
              const previewStyle = getCoverPreviewStyle(
                notebook.coverType,
                notebook.coverValue
              );

              return (
                <button
                  key={notebook.id}
                  onClick={() => handleMove(notebook.id)}
                  className={`w-full flex items-center justify-between gap-2 min-h-[44px] hover:bg-[var(--color-bg-secondary)] transition-colors text-left ${
                    isSelected ? "bg-[var(--color-bg-secondary)]" : ""
                  }`}
                  style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: 12 }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-4 h-4 rounded-sm flex-shrink-0"
                      style={previewStyle}
                    />
                    <span className="text-sm text-[var(--color-text-primary)] truncate">
                      {notebook.name}
                    </span>
                  </div>
                  {isSelected && (
                    <IconCheck size={14} className="text-[var(--color-accent)] flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
