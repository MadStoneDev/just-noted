"use client";

import React, { useState, useRef, useEffect } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { assignNoteToNotebook } from "@/app/actions/notebookActions";
import { getCoverPreviewStyle } from "@/lib/notebook-covers";
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
        className={`group/notebook px-2 cursor-pointer flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 w-fit min-w-10 h-10 rounded-lg border-1 ${
          isPrivate
            ? "border-violet-800 hover:bg-violet-800 hover:text-neutral-100"
            : "border-neutral-500 hover:border-mercedes-primary hover:bg-mercedes-primary"
        } text-neutral-800 overflow-hidden transition-all duration-300 ease-in-out disabled:opacity-50`}
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
        <div className="absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-lg border border-neutral-200 z-50 min-w-48 overflow-hidden">
          {/* Remove from notebook option */}
          {currentNotebookId && (
            <>
              <button
                onClick={() => handleMove(null)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 transition-colors text-left"
              >
                <IconFileOff size={16} className="text-neutral-500" />
                <span className="text-sm text-neutral-700">Remove from notebook</span>
              </button>
              <div className="border-t border-neutral-200" />
            </>
          )}

          {/* Notebooks list */}
          <div className="max-h-48 overflow-y-auto">
            {notebooks.map((notebook) => {
              const isSelected = notebook.id === currentNotebookId;
              const previewStyle = getCoverPreviewStyle(
                notebook.coverType,
                notebook.coverValue
              );

              return (
                <button
                  key={notebook.id}
                  onClick={() => handleMove(notebook.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-neutral-50 transition-colors text-left ${
                    isSelected ? "bg-neutral-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-4 h-4 rounded-sm flex-shrink-0"
                      style={previewStyle}
                    />
                    <span className="text-sm text-neutral-800 truncate">
                      {notebook.name}
                    </span>
                  </div>
                  {isSelected && (
                    <IconCheck size={14} className="text-mercedes-primary flex-shrink-0" />
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
