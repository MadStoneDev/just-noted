"use client";

import React, { useMemo, useState } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { getCoverPreviewStyle } from "@/lib/notebook-covers";
import { countWordsInContent } from "@/utils/word-count";
import NotebookDetailModal from "@/components/notebook-detail-modal";
import { IconPlus, IconX, IconLock } from "@tabler/icons-react";

interface NotebooksGridProps {
  onNewNotebook: () => void;
  onOpenNotebook: (id: string) => void;
  onEditCover: (id: string) => void;
  onDropNote: (noteId: string, notebookId: string) => void;
  onClose: () => void;
}

// Notebooks cover grid — design handoff surface 03.
export default function NotebooksGrid({
  onNewNotebook,
  onOpenNotebook,
  onEditCover,
  onDropNote,
  onClose,
}: NotebooksGridProps) {
  const notebooks = useNotesStore((s) => s.notebooks);
  const notes = useNotesStore((s) => s.notes);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const { wordByNb, countByNb, subByNb, totalFiled, looseCount } = useMemo(() => {
    const wordByNb: Record<string, number> = {};
    const countByNb: Record<string, number> = {};
    const subByNb: Record<string, number> = {};
    let filed = 0;
    let loose = 0;
    for (const n of notes) {
      if (n.deletedAt) continue;
      if (n.notebookId) {
        wordByNb[n.notebookId] =
          (wordByNb[n.notebookId] || 0) + countWordsInContent(n.content || "");
        countByNb[n.notebookId] = (countByNb[n.notebookId] || 0) + 1;
        filed++;
      } else if (n.source === "supabase") {
        loose++;
      }
    }
    for (const nb of notebooks) {
      if (nb.parentId) subByNb[nb.parentId] = (subByNb[nb.parentId] || 0) + 1;
    }
    return { wordByNb, countByNb, subByNb, totalFiled: filed, looseCount: loose };
  }, [notebooks, notes]);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-[1120px] px-6 md:px-10 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="font-[family-name:var(--font-editor)] text-[34px] leading-[1.05] font-medium tracking-[-0.01em] text-[var(--color-ink)]">
              Notebooks
            </h1>
            <p className="mt-1.5 text-[11.5px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
              {notebooks.length} notebook{notebooks.length !== 1 ? "s" : ""} · {totalFiled} filed{" "}
              note{totalFiled !== 1 ? "s" : ""} · {looseCount} loose
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onNewNotebook}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-7)] text-[12.5px] font-semibold bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90 transition-opacity"
            >
              <IconPlus size={15} stroke={2} />
              New notebook
            </button>
            <button
              onClick={onClose}
              aria-label="Close notebooks"
              className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-7)] text-[var(--color-ink-4)] hover:bg-[var(--color-raised-soft)] hover:text-[var(--color-ink-1)] transition-colors"
            >
              <IconX size={16} />
            </button>
          </div>
        </div>

        {notebooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-24 max-w-[320px] mx-auto">
            <h2 className="font-[family-name:var(--font-editor)] text-[24px] font-medium text-[var(--color-ink)]">
              No notebooks yet
            </h2>
            <p className="mt-2 text-[13.5px] leading-[1.55] text-[var(--color-ink-4)]">
              Notebooks group notes by project. Notes without one stay in Loose notes.
            </p>
            <button
              onClick={onNewNotebook}
              className="mt-5 inline-flex items-center gap-1.5 h-9 px-4 rounded-[var(--radius-7)] text-[13px] font-semibold bg-[var(--color-accent-fill)] text-[var(--color-accent-on-fill)] hover:opacity-90 transition-opacity"
            >
              <IconPlus size={16} stroke={2} />
              New notebook
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[18px]">
            {notebooks.map((nb) => {
              const words = wordByNb[nb.id] || 0;
              const count = countByNb[nb.id] || 0;
              const subs = subByNb[nb.id] || 0;
              const goal = nb.wordGoal || 0;
              const pct = goal > 0 ? Math.min(100, Math.round((words / goal) * 100)) : 0;
              const barColor =
                nb.coverType === "color" ? nb.coverValue : "var(--color-accent-fill)";
              return (
                <button
                  key={nb.id}
                  onClick={() => setDetailId(nb.id)}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes("application/x-jn-note")) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverId(nb.id);
                    }
                  }}
                  onDragLeave={() => setDragOverId((cur) => (cur === nb.id ? null : cur))}
                  onDrop={(e) => {
                    const noteId = e.dataTransfer.getData("application/x-jn-note");
                    setDragOverId(null);
                    if (noteId) { e.preventDefault(); onDropNote(noteId, nb.id); }
                  }}
                  className="group text-left"
                >
                  {/* Cover */}
                  <div
                    className="relative w-full aspect-[4/3] rounded-[var(--radius-10)] overflow-hidden transition-shadow"
                    style={{
                      ...getCoverPreviewStyle(nb.coverType, nb.coverValue),
                      boxShadow:
                        dragOverId === nb.id
                          ? `0 0 0 2px ${barColor}`
                          : "inset 0 0 0 1px var(--color-hairline)",
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                    {nb.isHidden && (
                      <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-5)] bg-black/45 text-white text-[10px] font-[family-name:var(--font-meta)]">
                        <IconLock size={10} />
                        private
                      </span>
                    )}
                    <span className="absolute bottom-2 left-3 right-3 truncate font-[family-name:var(--font-editor)] text-[19px] font-medium text-white drop-shadow">
                      {nb.name}
                    </span>
                  </div>

                  {/* Meta */}
                  <div className="mt-2">
                    <div className="text-[14px] font-semibold text-[var(--color-ink-1)] truncate">
                      {nb.name}
                    </div>
                    <div className="mt-0.5 text-[11px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
                      {count} note{count !== 1 ? "s" : ""} · {words.toLocaleString()}w
                      {subs > 0 ? ` · ${subs} sub` : ""}
                    </div>
                    {goal > 0 ? (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="h-[3px] flex-1 rounded-full bg-[var(--color-hairline)] overflow-hidden">
                          <span
                            className="block h-full rounded-full transition-all duration-300"
                            style={{ width: `${pct}%`, backgroundColor: barColor }}
                          />
                        </span>
                        <span className="text-[10px] font-[family-name:var(--font-meta)] text-[var(--color-ink-5)]">
                          {pct}%
                        </span>
                      </div>
                    ) : (
                      <div className="mt-1.5 text-[10px] font-[family-name:var(--font-meta)] text-[var(--color-ink-6)]">
                        no goal set
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <NotebookDetailModal
        notebookId={detailId}
        onClose={() => setDetailId(null)}
        onGoTo={(id) => { setDetailId(null); onOpenNotebook(id); }}
        onEditCover={(id) => { setDetailId(null); onEditCover(id); }}
        onOpenSub={(id) => setDetailId(id)}
      />
    </div>
  );
}
