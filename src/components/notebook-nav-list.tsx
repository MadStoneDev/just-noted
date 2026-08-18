"use client";

import React, { useState } from "react";
import { useNotesStore, useNotebooks } from "@/stores/notes-store";
import { Notebook, NOTEBOOK_LIMITS } from "@/types/notebook";
import { reorderNotebooks } from "@/app/actions/notebookActions";
import {
  IconChevronDown,
  IconChevronRight,
  IconNotebook,
  IconNote,
  IconPlus,
  IconSettings,
  IconTrash,
  IconCheck,
  IconFileOff,
  IconGripVertical,
  IconEyeOff,
} from "@tabler/icons-react";

// Private / hidden notebooks are marked with rose rather than faded out.
const PRIVATE_COLOR = "#F43F5E";
import { countWordsInContent } from "@/utils/word-count";

interface NotebookNavListProps {
  onNewNotebook: () => void;
  onEditNotebook: (notebook: Notebook) => void;
  onDeleteNotebook: (notebook: Notebook) => void;
  /** Called after a notebook / All Notes / Loose Notes is selected (e.g. to switch back to the notes view). */
  onSelected?: () => void;
}

/**
 * Full-height, inline notebook navigator used by the sidebar rail's "Notebooks"
 * view. Same data + two-line rows as the old dropdown, but it owns the whole
 * panel instead of being squeezed into a popover.
 */
export default function NotebookNavList({
  onNewNotebook,
  onEditNotebook,
  onDeleteNotebook,
  onSelected,
}: NotebookNavListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const notebooks = useNotebooks();
  const {
    activeNotebookId,
    setActiveNotebookId,
    notebookCounts,
    looseNotesCount,
    notes,
    notebooksLoading,
    setNotebooks,
  } = useNotesStore();

  const getNotebookWordCount = (notebookId: string) =>
    notes
      .filter((n) => n.notebookId === notebookId)
      .reduce((total, n) => total + countWordsInContent(n.content), 0);

  const totalNotesCount = notes.filter((n) => n.source === "supabase").length;
  const hiddenNotebookCount = notebooks.filter((nb) => nb.isHidden && !nb.parentId).length;
  const notebookLimitReached = notebooks.length >= NOTEBOOK_LIMITS.free;

  const handleSelect = (id: string | null) => {
    setActiveNotebookId(id);
    onSelected?.();
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedId && id !== draggedId) setDragOverId(id);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const from = notebooks.findIndex((nb) => nb.id === draggedId);
    const to = notebooks.findIndex((nb) => nb.id === targetId);
    if (from === -1 || to === -1) {
      setDraggedId(null);
      return;
    }
    const reordered = [...notebooks];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const updated = reordered.map((nb, i) => ({ ...nb, displayOrder: i }));
    setNotebooks(updated);
    setDraggedId(null);
    await reorderNotebooks(updated.map((nb) => ({ id: nb.id, order: nb.displayOrder })));
  };

  const rootNotebooks = notebooks.filter((nb) => !nb.parentId);
  const childrenOf = (parentId: string) => notebooks.filter((nb) => nb.parentId === parentId);

  const renderNotebook = (notebook: Notebook, depth: number, parentHidden = false) => {
    const children = childrenOf(notebook.id);
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedIds.has(notebook.id);
    const childNoteCount = children.reduce((sum, c) => sum + (notebookCounts[c.id] || 0), 0);
    const totalCount = (notebookCounts[notebook.id] || 0) + childNoteCount;
    const effectivelyHidden = notebook.isHidden || parentHidden;

    return (
      <React.Fragment key={notebook.id}>
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, notebook.id)}
          onDragOver={(e) => handleDragOver(e, notebook.id)}
          onDragLeave={() => setDragOverId(null)}
          onDrop={(e) => handleDrop(e, notebook.id)}
          onDragEnd={() => {
            setDraggedId(null);
            setDragOverId(null);
          }}
          className={`group/nb flex items-start rounded-[var(--radius-md)] ${
            draggedId === notebook.id ? "opacity-40" : ""
          } ${dragOverId === notebook.id ? "bg-[var(--color-accent-subtle)]" : ""}`}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCollapsedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(notebook.id)) next.delete(notebook.id);
                  else next.add(notebook.id);
                  return next;
                });
              }}
              className="pl-1 pt-2.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
              aria-label={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
            </button>
          ) : (
            <div className="pl-1 pt-2.5 cursor-grab text-[var(--color-text-tertiary)] opacity-0 group-hover/nb:opacity-50">
              <IconGripVertical size={14} />
            </div>
          )}
          <div className="flex-1 min-w-0 py-1">
            {/* Line 1 — notebook name (click to open) */}
            <button
              onClick={() => handleSelect(notebook.id)}
              className="w-full flex items-center gap-2 text-left min-w-0 px-1.5 py-1 rounded hover:bg-[var(--color-hover)] transition-colors"
            >
              <IconNotebook
                size={15}
                className="flex-shrink-0"
                style={{ color: effectivelyHidden ? PRIVATE_COLOR : "var(--color-text-tertiary)" }}
              />
              <span className="flex-1 text-sm text-[var(--color-text-primary)] break-words">
                {notebook.name}
              </span>
              {effectivelyHidden && (
                <IconEyeOff size={13} className="flex-shrink-0" style={{ color: PRIVATE_COLOR }} />
              )}
              {activeNotebookId === notebook.id && (
                <IconCheck size={14} className="text-[var(--color-accent)] flex-shrink-0" />
              )}
            </button>
            {/* Line 2 — count + word goal, with edit / delete inline */}
            <div className="flex items-center gap-2 mt-0.5 pl-1.5 pr-0.5">
              <span className="text-[11px] text-[var(--color-text-tertiary)] flex-shrink-0">
                {(() => {
                  const c = hasChildren ? totalCount : notebookCounts[notebook.id] || 0;
                  return `${c} note${c !== 1 ? "s" : ""}`;
                })()}
              </span>
              {(() => {
                const wc = getNotebookWordCount(notebook.id);
                if (notebook.wordGoal > 0) {
                  const pct = Math.min(100, Math.round((wc / notebook.wordGoal) * 100));
                  return (
                    <span
                      className="flex items-center gap-1 text-[10px] text-[var(--color-text-tertiary)] flex-shrink-0"
                      title={`${wc.toLocaleString()} / ${notebook.wordGoal.toLocaleString()} words`}
                    >
                      <span className="inline-block w-6 h-1 rounded-full bg-[var(--color-border-primary)] overflow-hidden">
                        <span
                          className="block h-full rounded-full bg-[var(--color-accent)]"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      {pct}%
                    </span>
                  );
                }
                if (wc > 0) {
                  return (
                    <span
                      className="text-[10px] text-[var(--color-text-tertiary)] flex-shrink-0"
                      title={`${wc.toLocaleString()} words`}
                    >
                      {wc.toLocaleString()}w
                    </span>
                  );
                }
                return null;
              })()}
              <div className="flex-1" />
              <div className="flex items-center opacity-100 md:opacity-0 md:group-hover/nb:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditNotebook(notebook);
                  }}
                  className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] rounded transition-colors"
                  title="Edit"
                  aria-label="Edit notebook"
                >
                  <IconSettings size={20} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNotebook(notebook);
                  }}
                  className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] rounded transition-colors"
                  title="Delete"
                  aria-label="Delete notebook"
                >
                  <IconTrash size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
        {hasChildren && !isCollapsed && (
          <div className="ml-[26px] border-l border-[var(--color-border-primary)]">
            {children.map((child) => renderNotebook(child, depth + 1, effectivelyHidden))}
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto scrollbar-thin p-1.5">
        {/* All Notes */}
        <button
          onClick={() => handleSelect(null)}
          className="w-full flex items-center justify-between px-2.5 min-h-[44px] rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <IconNote size={16} className="text-[var(--color-text-tertiary)]" />
            <span className="text-sm text-[var(--color-text-primary)]">All Notes</span>
            <span className="text-[11px] text-[var(--color-text-tertiary)]">{totalNotesCount}</span>
          </div>
          {activeNotebookId === null && <IconCheck size={16} className="text-[var(--color-accent)]" />}
        </button>
        {hiddenNotebookCount > 0 && activeNotebookId === null && (
          <div className="px-2.5 py-1 flex items-center gap-1.5 text-[11px]" style={{ color: PRIVATE_COLOR }}>
            <IconEyeOff size={12} />
            <span>
              {hiddenNotebookCount} private notebook{hiddenNotebookCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* Loose Notes */}
        <button
          onClick={() => handleSelect("loose")}
          className="w-full flex items-center justify-between px-2.5 min-h-[44px] rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <IconFileOff size={16} className="text-[var(--color-text-tertiary)]" />
            <span className="text-sm text-[var(--color-text-primary)]">Loose Notes</span>
            <span className="text-[11px] text-[var(--color-text-tertiary)]">{looseNotesCount}</span>
          </div>
          {activeNotebookId === "loose" && <IconCheck size={16} className="text-[var(--color-accent)]" />}
        </button>

        {notebooks.length > 0 && <div className="h-px bg-[var(--color-border-secondary)] my-1.5" />}

        {notebooksLoading ? (
          <div className="px-2.5 py-3 text-center text-[11px] text-[var(--color-text-tertiary)]">
            Loading...
          </div>
        ) : (
          rootNotebooks.map((nb) => renderNotebook(nb, 0))
        )}
      </div>

      {/* Create notebook — pinned to the bottom so the list never hides behind it */}
      <div className="flex-none border-t border-[var(--color-border-secondary)] p-1.5">
        <button
          onClick={onNewNotebook}
          disabled={notebookLimitReached}
          className={`w-full flex items-center justify-center gap-2 px-2.5 min-h-[42px] rounded-[var(--radius-md)] border border-dashed transition-colors ${
            notebookLimitReached
              ? "text-[var(--color-text-tertiary)] border-[var(--color-border-secondary)] cursor-not-allowed"
              : "text-[var(--color-accent)] border-[var(--color-border-primary)] hover:bg-[var(--color-accent-subtle)] hover:border-[var(--color-accent)]"
          }`}
        >
          <IconPlus size={16} />
          <span className="text-sm font-medium">Create notebook</span>
        </button>
      </div>
    </div>
  );
}
