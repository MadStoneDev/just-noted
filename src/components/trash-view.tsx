"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  getTrashedNotes,
  restoreNote,
  permanentlyDeleteNote,
} from "@/app/actions/supabaseActions";
import { supabaseToCombi } from "@/types/combined-notes";
import type { CombinedNote } from "@/types/combined-notes";
import { IconTrash, IconArrowBackUp, IconX } from "@tabler/icons-react";
import { ConfirmModal } from "@/components/ds/modal";

interface TrashViewProps {
  open: boolean;
  onClose: () => void;
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function TrashView({ open, onClose }: TrashViewProps) {
  const [notes, setNotes] = useState<CombinedNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTrashedNotes();
      if (result.success && result.notes) {
        setNotes(result.notes.map((n: any) => ({
          ...supabaseToCombi(n),
          deletedAt: n.deleted_at ? new Date(n.deleted_at).getTime() : null,
        })));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadTrash();
  }, [open, loadTrash]);

  const handleRestore = useCallback(async (noteId: string) => {
    const result = await restoreNote(noteId);
    if (result.success) {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    }
  }, []);

  const handlePermanentDelete = useCallback(async (noteId: string) => {
    const result = await permanentlyDeleteNote(noteId);
    if (result.success) {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    }
    setConfirmDeleteId(null);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-[var(--color-bg-overlay)]" />
      <div className="relative w-full max-w-md mx-4 bg-[var(--color-bg-elevated)] rounded-[var(--radius-xl)] shadow-[var(--shadow-modal)] border border-[var(--color-border-secondary)] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border-secondary)]">
          <div className="flex items-center gap-2">
            <IconTrash size={16} className="text-[var(--color-text-tertiary)]" />
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Trash</h3>
            <span className="text-[10px] text-[var(--color-text-tertiary)]">{notes.length} note{notes.length !== 1 ? "s" : ""}</span>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] rounded transition-colors">
            <IconX size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[50vh] overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">Loading...</div>
          ) : notes.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[var(--color-text-tertiary)]">Trash is empty</p>
              <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">Deleted notes appear here for 30 days</p>
            </div>
          ) : (
            <ul>
              {notes.map((note) => (
                <li key={note.id} className="flex items-center justify-between px-5 py-2.5 border-b border-[var(--color-border-secondary)] last:border-0 hover:bg-[var(--color-hover)] transition-colors">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">{note.title}</p>
                    <p className="text-[10px] text-[var(--color-text-tertiary)]">
                      Deleted {note.deletedAt ? relativeTime(note.deletedAt) : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleRestore(note.id)}
                      className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] rounded transition-colors"
                      title="Restore"
                    >
                      <IconArrowBackUp size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(note.id)}
                      className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] rounded transition-colors"
                      title="Delete permanently"
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-[var(--color-border-secondary)] text-[10px] text-[var(--color-text-tertiary)]">
          Notes in trash are automatically deleted after 30 days
        </div>

        <ConfirmModal
          open={!!confirmDeleteId}
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={() => confirmDeleteId && handlePermanentDelete(confirmDeleteId)}
          title="Delete permanently"
          message="This note will be gone forever. Are you sure?"
          confirmText="Delete Forever"
          destructive
        />
      </div>
    </div>
  );
}
