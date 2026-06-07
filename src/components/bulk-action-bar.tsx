"use client";

import React, { useState, useRef, useEffect } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { bulkAssignNotesToNotebook } from "@/app/actions/notebookActions";
import { getSortedNotebookTree } from "@/utils/notebook-tree";
import { ConfirmModal } from "@/components/ds/modal";
import {
  IconX,
  IconNotebook,
  IconFileOff,
  IconLoader2,
  IconTrash,
} from "@tabler/icons-react";

interface BulkActionBarProps {
  selectedNoteIds: Set<string>;
  onClearSelection: () => void;
  onAssignComplete: () => void;
  onBulkDelete?: (noteIds: string[]) => void;
}

export default function BulkActionBar({
  selectedNoteIds,
  onClearSelection,
  onAssignComplete,
  onBulkDelete,
}: BulkActionBarProps) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { notebooks, optimisticUpdateNote, recalculateNotebookCounts } =
    useNotesStore();

  const count = selectedNoteIds.size;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMoveMenu(false);
      }
    };
    if (showMoveMenu) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMoveMenu]);

  const handleAssign = async (notebookId: string | null) => {
    if (count === 0) return;
    setIsAssigning(true);
    setShowMoveMenu(false);

    const noteIds = Array.from(selectedNoteIds);
    noteIds.forEach((id) => optimisticUpdateNote(id, { notebookId }));

    try {
      const result = await bulkAssignNotesToNotebook(noteIds, notebookId);
      if (result.success) {
        recalculateNotebookCounts();
        onAssignComplete();
        onClearSelection();
      }
    } finally {
      setIsAssigning(false);
    }
  };

  const handleDelete = async () => {
    if (count === 0 || !onBulkDelete) return;
    setIsDeleting(true);
    onBulkDelete(Array.from(selectedNoteIds));
    onClearSelection();
    setIsDeleting(false);
  };

  if (count === 0) return null;

  return (
    <div className="sticky bottom-0 left-0 right-0 px-3 py-2 bg-[var(--color-bg-tertiary)] border-t border-[var(--color-border-secondary)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-[var(--color-text-secondary)]">
            {count} selected
          </span>
          <button
            onClick={onClearSelection}
            className="p-0.5 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
            title="Clear"
          >
            <IconX size={11} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Move */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setShowMoveMenu(!showMoveMenu)}
              disabled={isAssigning}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] transition-colors disabled:opacity-50"
            >
              {isAssigning ? <IconLoader2 size={11} className="animate-spin" /> : <IconNotebook size={11} />}
              Move
            </button>

            {showMoveMenu && (
              <div className="absolute bottom-full right-0 mb-1 bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] border border-[var(--color-border-primary)] min-w-[140px] overflow-hidden z-50">
                <button
                  onClick={() => handleAssign(null)}
                  className="w-full flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-[var(--color-hover)] transition-colors text-left"
                >
                  <IconFileOff size={11} className="text-[var(--color-text-tertiary)]" />
                  <span className="text-[11px] text-[var(--color-text-primary)]">Remove from notebook</span>
                </button>
                {notebooks.length > 0 && <div className="h-px bg-[var(--color-border-secondary)]" />}
                <div className="max-h-32 overflow-y-auto">
                  {getSortedNotebookTree(notebooks).map(({ notebook: nb, depth }) => (
                    <button
                      key={nb.id}
                      onClick={() => handleAssign(nb.id)}
                      className="w-full flex items-center gap-1.5 py-1.5 hover:bg-[var(--color-hover)] transition-colors text-left"
                      style={{ paddingLeft: `${10 + depth * 12}px`, paddingRight: 10 }}
                    >
                      <span className="text-[11px] text-[var(--color-text-primary)] truncate">{nb.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Delete */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-[var(--color-danger-subtle)] border border-transparent rounded-[var(--radius-sm)] text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white transition-colors disabled:opacity-50"
          >
            <IconTrash size={11} />
            Delete
          </button>
        </div>
      </div>

      <ConfirmModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          handleDelete();
          setShowDeleteConfirm(false);
        }}
        title="Delete notes"
        message={`Delete ${count} selected note${count !== 1 ? "s" : ""}? This can't be undone.`}
        confirmText="Delete"
        destructive
      />
    </div>
  );
}
