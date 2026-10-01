"use client";

import React, { useMemo } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { getCoverPreviewStyle } from "@/lib/notebook-covers";
import { countWordsInContent } from "@/utils/word-count";
import {
  IconChevronLeft,
  IconArrowRight,
  IconPencil,
  IconLock,
} from "@tabler/icons-react";

interface NotebookViewProps {
  notebookId: string;
  /** Navigate to another notebook's Level 2 view, or the grid when null. */
  onNavigateNotebook: (id: string | null) => void;
  /** Open this notebook's notes (switches to Notes mode, filtered). */
  onOpenNotes: (id: string) => void;
  /** Open the create/edit sheet for this notebook. */
  onEdit: (id: string) => void;
}

// Level 2 — the single-notebook view (route /notebooks/:id). Phase 1 scaffold:
// header + stats + sections + "open notes" + edit (parity with the old detail
// drawer, now a routed view). The full §5 layout (notes list, sections row with
// add card, scope toggle, drop zones) lands in Phase 4.
export default function NotebookView({
  notebookId,
  onNavigateNotebook,
  onOpenNotes,
  onEdit,
}: NotebookViewProps) {
  const notebooks = useNotesStore((s) => s.notebooks);
  const notes = useNotesStore((s) => s.notes);

  const nb = notebooks.find((n) => n.id === notebookId) || null;
  const parent = nb?.parentId ? notebooks.find((n) => n.id === nb.parentId) || null : null;
  const subs = useMemo(
    () => notebooks.filter((n) => n.parentId === notebookId),
    [notebooks, notebookId],
  );

  // Counts: a top-level notebook includes its sections' notes (§7); a section
  // counts only its own.
  const { noteCount, wordTotal } = useMemo(() => {
    const ids = new Set<string>([notebookId, ...subs.map((s) => s.id)]);
    let count = 0;
    let words = 0;
    for (const n of notes) {
      if (n.deletedAt || !n.notebookId || !ids.has(n.notebookId)) continue;
      count += 1;
      words += countWordsInContent(n.content || "");
    }
    return { noteCount: count, wordTotal: words };
  }, [notes, notebookId, subs]);

  if (!nb) {
    // Notebook not found (deleted, or a stale deep link) — bounce to the grid.
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-[var(--color-canvas)]">
        <div className="mx-auto max-w-[1040px] px-6 md:px-10 py-10">
          <button
            onClick={() => onNavigateNotebook(null)}
            className="inline-flex items-center gap-1 text-[13px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)] transition-colors"
          >
            <IconChevronLeft size={16} /> Notebooks
          </button>
          <p className="mt-8 text-[14px] text-[var(--color-ink-4)]">This notebook no longer exists.</p>
        </div>
      </div>
    );
  }

  const goal = nb.wordGoal || 0;
  const pct = goal > 0 ? Math.min(100, Math.round((wordTotal / goal) * 100)) : 0;
  const barColor = nb.coverType === "color" ? nb.coverValue : "var(--color-accent-fill)";

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-[1040px] px-6 md:px-10 py-8">
        {/* Back link */}
        <button
          onClick={() => onNavigateNotebook(parent ? parent.id : null)}
          className="inline-flex items-center gap-1 h-8 -ml-1 text-[13px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)] transition-colors"
        >
          <IconChevronLeft size={16} />
          {parent ? parent.name : "Notebooks"}
        </button>

        {/* Header */}
        <div className="mt-2 flex items-start gap-4">
          <div
            className="relative w-24 h-24 shrink-0 rounded-[var(--radius-10)] overflow-hidden ring-1 ring-[var(--color-hairline)]"
            style={getCoverPreviewStyle(nb.coverType, nb.coverValue)}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          </div>
          <div className="min-w-0 flex-1">
            {parent && (
              <button
                onClick={() => onNavigateNotebook(parent.id)}
                className="inline-flex items-center gap-1.5 mb-1 text-[12px] text-[var(--color-ink-4)] hover:text-[var(--color-ink-1)] transition-colors"
              >
                <span className="w-[10px] h-[10px] rounded-[3px]" style={getCoverPreviewStyle(parent.coverType, parent.coverValue)} />
                {parent.name}
              </button>
            )}
            <div className="flex items-center gap-2">
              <h1 className="font-[family-name:var(--font-editor)] text-[28px] leading-[1.1] font-medium tracking-[-0.01em] text-[var(--color-ink)] truncate">
                {nb.name}
              </h1>
              {nb.isHidden && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-5)] bg-[var(--color-raised-soft)] text-[10px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
                  <IconLock size={10} /> private
                </span>
              )}
            </div>
            <div className="mt-1.5 text-[12px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
              {noteCount} note{noteCount !== 1 ? "s" : ""} · {wordTotal.toLocaleString()} words
              {subs.length > 0 ? ` · ${subs.length} section${subs.length !== 1 ? "s" : ""}` : ""}
            </div>
            {goal > 0 && (
              <div className="mt-2 flex items-center gap-2 max-w-[320px]">
                <span className="h-[4px] flex-1 rounded-full bg-[var(--color-hairline)] overflow-hidden">
                  <span className="block h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                </span>
                <span className="text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
                  {pct}% of {goal.toLocaleString()}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => onOpenNotes(nb.id)}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[var(--radius-7)] text-[13px] font-semibold bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90 transition-opacity"
              >
                Open notes
                <IconArrowRight size={15} />
              </button>
              <button
                onClick={() => onEdit(nb.id)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-7)] text-[13px] font-medium text-[var(--color-ink-2)] border border-[var(--color-border-control)] hover:bg-[var(--color-raised-soft)] transition-colors"
              >
                <IconPencil size={14} />
                Edit
              </button>
            </div>
          </div>
        </div>

        {/* Sections */}
        {subs.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 text-[11px] font-[family-name:var(--font-meta)] uppercase tracking-wider text-[var(--color-ink-5)]">
              Sections
            </div>
            <div className="flex flex-wrap gap-3">
              {subs.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onNavigateNotebook(s.id)}
                  className="w-[160px] text-left group"
                >
                  <div
                    className="relative w-full aspect-[4/3] rounded-[var(--radius-8)] overflow-hidden ring-1 ring-[var(--color-hairline)]"
                    style={getCoverPreviewStyle(s.coverType, s.coverValue)}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                    <span className="absolute bottom-2 left-2.5 right-2.5 truncate font-[family-name:var(--font-editor)] text-[15px] font-medium text-white drop-shadow">
                      {s.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
