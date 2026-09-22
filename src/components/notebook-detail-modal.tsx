"use client";

import React, { useEffect, useState } from "react";
import { Modal, ConfirmModal } from "@/components/ds/modal";
import { useNotesStore } from "@/stores/notes-store";
import { getCoverPreviewStyle } from "@/lib/notebook-covers";
import { countWordsInContent } from "@/utils/word-count";
import { updateNotebook, deleteNotebook } from "@/app/actions/notebookActions";
import {
  IconArrowRight,
  IconPencil,
  IconTrash,
  IconPlus,
  IconPhoto,
  IconBook,
} from "@tabler/icons-react";

interface NotebookDetailModalProps {
  notebookId: string | null;
  onClose: () => void;
  onGoTo: (id: string) => void;
  onEditCover: (id: string) => void;
  onOpenSub: (id: string) => void;
}

// Single-notebook summary panel (design handoff surface 03).
export default function NotebookDetailModal({
  notebookId,
  onClose,
  onGoTo,
  onEditCover,
  onOpenSub,
}: NotebookDetailModalProps) {
  const notebooks = useNotesStore((s) => s.notebooks);
  const notes = useNotesStore((s) => s.notes);
  const updateNotebookInStore = useNotesStore((s) => s.updateNotebook);
  const removeNotebook = useNotesStore((s) => s.removeNotebook);
  const nb = notebookId ? notebooks.find((n) => n.id === notebookId) : null;

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [goalInput, setGoalInput] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (nb) {
      setName(nb.name);
      setGoalInput(nb.wordGoal ? String(nb.wordGoal) : "");
      setEditingName(false);
      setEditingGoal(false);
    }
  }, [nb?.id]);

  if (!nb) return null;

  const owned = notes.filter((n) => !n.deletedAt && n.notebookId === nb.id);
  const noteCount = owned.length;
  const wordTotal = owned.reduce((s, n) => s + countWordsInContent(n.content || ""), 0);
  const subs = notebooks.filter((n) => n.parentId === nb.id);
  const goal = nb.wordGoal || 0;
  const pct = goal > 0 ? Math.min(100, Math.round((wordTotal / goal) * 100)) : 0;
  const barColor = nb.coverType === "color" ? nb.coverValue : "var(--color-accent-fill)";

  const saveName = async () => {
    setEditingName(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === nb.name) { setName(nb.name); return; }
    const res = await updateNotebook(nb.id, { name: trimmed });
    if (res.success && res.notebook) updateNotebookInStore(nb.id, res.notebook);
  };

  const saveGoal = async () => {
    setEditingGoal(false);
    const g = parseInt(goalInput) || 0;
    if (g === (nb.wordGoal || 0)) return;
    const res = await updateNotebook(nb.id, { wordGoal: g });
    if (res.success && res.notebook) updateNotebookInStore(nb.id, res.notebook);
  };

  const doDelete = async () => {
    const res = await deleteNotebook(nb.id);
    if (res.success) {
      removeNotebook(nb.id);
      setConfirmDelete(false);
      onClose();
    }
  };

  return (
    <>
      <Modal open={!!notebookId} onClose={onClose} size="md">
        <div className="space-y-5">
          {/* Cover */}
          <div
            className="relative h-28 rounded-[var(--radius-12)] overflow-hidden ring-1 ring-[var(--color-hairline)]"
            style={getCoverPreviewStyle(nb.coverType, nb.coverValue)}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <button
              onClick={() => onEditCover(nb.id)}
              className="absolute top-2 right-2 inline-flex items-center gap-1 h-7 px-2 rounded-[var(--radius-6)] bg-black/40 text-white text-[11px] hover:bg-black/55 transition-colors"
            >
              <IconPhoto size={13} />
              Cover
            </button>
          </div>

          {/* Name (inline editable) */}
          {editingName ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setName(nb.name); setEditingName(false); } }}
              className="w-full font-[family-name:var(--font-editor)] text-[26px] font-medium text-[var(--color-ink)] bg-transparent border-b border-[var(--color-accent-tint-border)] outline-none"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="group inline-flex items-center gap-2 text-left"
            >
              <span className="font-[family-name:var(--font-editor)] text-[26px] font-medium text-[var(--color-ink)]">{nb.name}</span>
              <IconPencil size={15} className="text-[var(--color-ink-5)] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}

          {/* Stats */}
          <div className="text-[12px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
            {noteCount} note{noteCount !== 1 ? "s" : ""} · {wordTotal.toLocaleString()} words
            {subs.length > 0 ? ` · ${subs.length} sub-notebook${subs.length !== 1 ? "s" : ""}` : ""}
          </div>

          {/* Goal */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] font-medium text-[var(--color-ink-2)]">Word goal</span>
              {!editingGoal && (
                <button onClick={() => setEditingGoal(true)} className="text-[11.5px] text-[var(--color-accent-text)] hover:text-[var(--color-accent-deep)]">
                  {goal > 0 ? "Edit" : "Set a goal"}
                </button>
              )}
            </div>
            {editingGoal ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  inputMode="numeric"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value.replace(/[^0-9]/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") saveGoal(); }}
                  placeholder="e.g. 50000"
                  className="flex-1 h-9 px-3 text-[13px] bg-[var(--color-raised)] border border-[var(--color-border-control)] rounded-[var(--radius-8)] text-[var(--color-ink)] focus:border-[var(--color-accent-tint-border)] focus:outline-none"
                />
                <button onClick={saveGoal} className="h-9 px-3 rounded-[var(--radius-7)] text-[12.5px] font-semibold bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90">Save</button>
              </div>
            ) : goal > 0 ? (
              <div className="flex items-center gap-2">
                <span className="h-[4px] flex-1 rounded-full bg-[var(--color-hairline)] overflow-hidden">
                  <span className="block h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                </span>
                <span className="text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">{pct}% of {goal.toLocaleString()}</span>
              </div>
            ) : (
              <p className="text-[12px] text-[var(--color-ink-5)]">No goal set.</p>
            )}
          </div>

          {/* Sub-notebooks */}
          {subs.length > 0 && (
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-5)] mb-1.5">Sub-notebooks</div>
              <div className="flex flex-col gap-1">
                {subs.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onOpenSub(s.id)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-7)] text-[13px] text-[var(--color-ink-2)] hover:bg-[var(--color-raised-soft)] transition-colors"
                  >
                    <span className="w-[10px] h-[10px] rounded-[3px] shrink-0" style={getCoverPreviewStyle(s.coverType, s.coverValue)} />
                    <span className="truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => onGoTo(nb.id)}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[var(--radius-7)] text-[13px] font-semibold bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90 transition-opacity"
            >
              Go to notebook
              <IconArrowRight size={15} />
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setConfirmDelete(true)}
              title="Delete notebook"
              className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--radius-7)] text-[var(--color-ink-5)] hover:text-[var(--color-danger-strong)] hover:bg-[var(--color-raised-soft)] transition-colors"
            >
              <IconTrash size={16} />
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        title="Delete notebook"
        message={`Delete "${nb.name}"? Its ${noteCount} note${noteCount !== 1 ? "s" : ""} become loose notes.`}
        confirmText="Delete notebook"
        destructive
      />
    </>
  );
}
