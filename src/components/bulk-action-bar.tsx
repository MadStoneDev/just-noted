"use client";

import React, { useState, useRef, useEffect } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { bulkAssignNotesToNotebook } from "@/app/actions/notebookActions";
import { getCoverPreviewStyle } from "@/lib/notebook-covers";
import {
  IconX,
  IconNotebook,
  IconCheck,
  IconFileOff,
  IconLoader2,
} from "@tabler/icons-react";

interface BulkActionBarProps {
  selectedNoteIds: Set<string>;
  onClearSelection: () => void;
  onAssignComplete: () => void;
}

export default function BulkActionBar({
  selectedNoteIds,
  onClearSelection,
  onAssignComplete,
}: BulkActionBarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    notebooks,
    optimisticUpdateNote,
    recalculateNotebookCounts,
  } = useNotesStore();

  const selectedCount = selectedNoteIds.size;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen]);

  const handleAssign = async (notebookId: string | null) => {
    if (selectedCount === 0) return;

    setIsAssigning(true);
    setIsDropdownOpen(false);

    const noteIds = Array.from(selectedNoteIds);

    // Optimistic update
    noteIds.forEach((noteId) => {
      optimisticUpdateNote(noteId, { notebookId });
    });

    try {
      const result = await bulkAssignNotesToNotebook(noteIds, notebookId);

      if (result.success) {
        recalculateNotebookCounts();
        onAssignComplete();
        onClearSelection();
      } else {
        // Revert on failure - would need original values to properly revert
        console.error("Failed to assign notes:", result.error);
      }
    } catch (error) {
      console.error("Failed to assign notes:", error);
    } finally {
      setIsAssigning(false);
    }
  };

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="sticky bottom-0 left-0 right-0 p-3 bg-mercedes-primary text-white shadow-lg border-t border-mercedes-primary/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {selectedCount} note{selectedCount !== 1 ? "s" : ""} selected
          </span>
          <button
            onClick={onClearSelection}
            className="p-1 rounded hover:bg-white/20 transition-colors"
            title="Clear selection"
          >
            <IconX size={16} />
          </button>
        </div>

        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            disabled={isAssigning}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors disabled:opacity-50"
          >
            {isAssigning ? (
              <IconLoader2 size={16} className="animate-spin" />
            ) : (
              <IconNotebook size={16} />
            )}
            <span>Move to Notebook</span>
          </button>

          {isDropdownOpen && (
            <div className="absolute bottom-full right-0 mb-2 bg-white rounded-lg shadow-lg border border-neutral-200 min-w-48 overflow-hidden z-50">
              {/* Remove from notebook */}
              <button
                onClick={() => handleAssign(null)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 transition-colors text-left text-neutral-700"
              >
                <IconFileOff size={16} className="text-neutral-500" />
                <span className="text-sm">Remove from notebook</span>
              </button>

              {notebooks.length > 0 && (
                <div className="border-t border-neutral-200" />
              )}

              {/* Notebooks list */}
              <div className="max-h-48 overflow-y-auto">
                {notebooks.map((notebook) => {
                  const previewStyle = getCoverPreviewStyle(
                    notebook.coverType,
                    notebook.coverValue
                  );

                  return (
                    <button
                      key={notebook.id}
                      onClick={() => handleAssign(notebook.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 transition-colors text-left"
                    >
                      <div
                        className="w-4 h-4 rounded-sm flex-shrink-0"
                        style={previewStyle}
                      />
                      <span className="text-sm text-neutral-800 truncate">
                        {notebook.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
