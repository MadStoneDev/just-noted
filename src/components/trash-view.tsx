"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  getTrashedNotes,
  getTrashState,
  restoreNote,
  permanentlyDeleteNote,
} from "@/app/actions/supabaseActions";
import { supabaseToCombi } from "@/types/combined-notes";
import type { CombinedNote } from "@/types/combined-notes";
import { useNotesStore } from "@/stores/notes-store";
import { countWordsInContent } from "@/utils/word-count";
import { getCoverPreviewStyle } from "@/lib/notebook-covers";
import { DEFAULT_SCRIBE_RETENTION_DAYS } from "@/lib/retention";
import { IconX, IconTrash } from "@tabler/icons-react";
import { ConfirmModal } from "@/components/ds/modal";

interface TrashViewProps {
  onClose: () => void;
}

const DAY = 86400000;

function relativeTime(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / DAY);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// Design handoff surface 10 — Trash as a real main-area view.
export default function TrashView({ onClose }: TrashViewProps) {
  const notebooks = useNotesStore((s) => s.notebooks);
  const [allNotes, setAllNotes] = useState<CombinedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // null while resolving; false = guest (no account, notes never retained).
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [retentionDays, setRetentionDays] = useState(DEFAULT_SCRIBE_RETENTION_DAYS);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    try {
      const state = await getTrashState();
      if (!state.authenticated) {
        setAuthenticated(false);
        return;
      }
      setAuthenticated(true);
      setRetentionDays(state.retentionDays);

      const result = await getTrashedNotes();
      if (result.success && result.notes) {
        setAllNotes(
          result.notes.map((n: any) => ({
            ...supabaseToCombi(n),
            deletedAt: n.deleted_at ? new Date(n.deleted_at).getTime() : null,
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  // Retention is enforced at the display layer: notes older than the window are
  // treated as gone (a cron hard-deletes them past the physical cutoff).
  const notes = useMemo(() => {
    const cutoff = Date.now() - retentionDays * DAY;
    return allNotes.filter((n) => (n.deletedAt ?? 0) >= cutoff);
  }, [allNotes, retentionDays]);

  const totalWords = useMemo(
    () => notes.reduce((sum, n) => sum + countWordsInContent(n.content || ""), 0),
    [notes],
  );

  const handleRestore = useCallback(async (noteId: string) => {
    const result = await restoreNote(noteId);
    if (result.success) setAllNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, []);

  const handleRestoreAll = useCallback(async () => {
    setBusy(true);
    const ids = notes.map((n) => n.id);
    for (const id of ids) await restoreNote(id);
    setAllNotes((prev) => prev.filter((n) => !ids.includes(n.id)));
    setBusy(false);
  }, [notes]);

  const handlePermanentDelete = useCallback(async (noteId: string) => {
    setConfirmDeleteId(null);
    const result = await permanentlyDeleteNote(noteId);
    if (result.success) setAllNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, []);

  const handleEmptyTrash = useCallback(async () => {
    setBusy(true);
    const ids = notes.map((n) => n.id);
    for (const id of ids) await permanentlyDeleteNote(id);
    setAllNotes((prev) => prev.filter((n) => !ids.includes(n.id)));
    setBusy(false);
    setConfirmEmpty(false);
  }, [notes]);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-[900px] px-6 md:px-10 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="font-[family-name:var(--font-editor)] text-[34px] leading-[1.05] font-medium tracking-[-0.01em] text-[var(--color-ink)]">
              Trash
            </h1>
            <p className="mt-1.5 text-[11.5px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
              {authenticated === false
                ? "Deleted notes"
                : `${notes.length} note${notes.length !== 1 ? "s" : ""} · deleted notes are removed after ${retentionDays} days`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {notes.length > 0 && (
              <>
                <button
                  onClick={handleRestoreAll}
                  disabled={busy}
                  className="h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-medium border border-[var(--color-border-control)] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors disabled:opacity-50"
                >
                  Restore all
                </button>
                <button
                  onClick={() => setConfirmEmpty(true)}
                  disabled={busy}
                  className="h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-medium bg-[var(--color-danger-tint)] border border-[var(--color-danger-tint-border)] text-[var(--color-danger-strong)] hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Empty trash
                </button>
              </>
            )}
            <button
              onClick={onClose}
              aria-label="Close trash"
              className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-7)] text-[var(--color-ink-4)] hover:bg-[var(--color-raised-soft)] hover:text-[var(--color-ink-1)] transition-colors"
            >
              <IconX size={16} />
            </button>
          </div>
        </div>

        {authenticated === false ? (
          <div className="flex flex-col items-center justify-center text-center py-24 max-w-[360px] mx-auto">
            <h2 className="font-[family-name:var(--font-editor)] text-[24px] font-medium text-[var(--color-ink)]">
              Deleted notes aren't kept
            </h2>
            <p className="mt-2 text-[13.5px] leading-[1.55] text-[var(--color-ink-4)]">
              Without an account, a deleted note is gone for good right away.
              Create a free account and deleted notes wait in Trash for 30 days —
              no credit card needed.
            </p>
            <a
              href="/get-access"
              className="mt-5 inline-flex items-center h-9 px-4 rounded-[var(--radius-8)] text-[13px] font-medium bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:bg-[var(--color-accent-deep)] transition-colors"
            >
              Create a free account
            </a>
          </div>
        ) : loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-12 w-full rounded-[var(--radius-9)]" />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-24 max-w-[320px] mx-auto">
            <h2 className="font-[family-name:var(--font-editor)] text-[24px] font-medium text-[var(--color-ink)]">
              Trash is empty
            </h2>
            <p className="mt-2 text-[13.5px] leading-[1.55] text-[var(--color-ink-4)]">
              Deleted notes appear here for {retentionDays} days, then they're gone for good.
            </p>
          </div>
        ) : (
          <div className="rounded-[var(--radius-12)] border border-[var(--color-hairline)] overflow-x-auto">
            {/* Column header */}
            <div className="grid min-w-[600px] grid-cols-[1fr_150px_90px_90px_120px] gap-3 px-4 py-2 bg-[var(--color-panel)] border-b border-[var(--color-hairline)] text-[10px] font-[family-name:var(--font-meta)] uppercase tracking-[0.12em] text-[var(--color-ink-5)]">
              <span>Note</span>
              <span>Notebook</span>
              <span>Deleted</span>
              <span className="text-right">Removed in</span>
              <span className="text-right">Actions</span>
            </div>
            {notes.map((note) => {
              const words = countWordsInContent(note.content || "");
              const nb = note.notebookId
                ? notebooks.find((n) => n.id === note.notebookId)
                : null;
              const purgeAt = (note.deletedAt || Date.now()) + retentionDays * DAY;
              const daysLeft = Math.max(0, Math.ceil((purgeAt - Date.now()) / DAY));
              const countdownColor =
                daysLeft < 3
                  ? "var(--color-danger-strong)"
                  : daysLeft < 14
                    ? "var(--color-warn)"
                    : "var(--color-ink-4)";
              return (
                <div
                  key={note.id}
                  className="grid min-w-[600px] grid-cols-[1fr_150px_90px_90px_120px] gap-3 px-4 py-2.5 items-center border-b border-[var(--color-hairline-soft)] last:border-0 hover:bg-[var(--color-raised-soft)] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-[13.5px] text-[var(--color-ink-1)] truncate">
                      {note.title || "Untitled"}
                    </div>
                    <div className="text-[10.5px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
                      {words.toLocaleString()}w
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    {nb ? (
                      <>
                        <span
                          className="w-[7px] h-[7px] rounded-[2px] shrink-0"
                          style={getCoverPreviewStyle(nb.coverType, nb.coverValue)}
                        />
                        <span className="text-[12px] text-[var(--color-ink-3)] truncate">{nb.name}</span>
                      </>
                    ) : (
                      <span className="text-[12px] text-[var(--color-ink-5)]">Loose notes</span>
                    )}
                  </div>
                  <div className="text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
                    {note.deletedAt ? relativeTime(note.deletedAt) : ""}
                  </div>
                  <div
                    className="text-right text-[11px] font-[family-name:var(--font-meta)]"
                    style={{ color: countdownColor }}
                  >
                    {daysLeft}d
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleRestore(note.id)}
                      className="text-[11.5px] text-[var(--color-accent-text)] hover:text-[var(--color-accent-deep)] transition-colors"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(note.id)}
                      title="Delete permanently"
                      aria-label="Delete permanently"
                      className="p-1 rounded-[var(--radius-6)] text-[var(--color-ink-5)] hover:text-[var(--color-danger)] hover:bg-[var(--color-raised-soft)] transition-colors"
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmEmpty}
        onClose={() => setConfirmEmpty(false)}
        onConfirm={handleEmptyTrash}
        title="Empty trash"
        message={`This will permanently delete ${notes.length} note${notes.length !== 1 ? "s" : ""} (${totalWords.toLocaleString()} words). This cannot be undone.`}
        confirmText="Empty trash"
        destructive
      />

      <ConfirmModal
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => confirmDeleteId && handlePermanentDelete(confirmDeleteId)}
        title="Delete permanently"
        message="This note will be permanently deleted. This can't be undone."
        confirmText="Delete forever"
        destructive
      />
    </div>
  );
}
