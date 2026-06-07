"use client";

import React, { useState, useRef, useEffect } from "react";
import { useNotesStore, useNotebooks, useActiveNotebook } from "@/stores/notes-store";
import { Notebook, NOTEBOOK_LIMITS } from "@/types/notebook";
import { reorderNotebooks } from "@/app/actions/notebookActions";
import {
  IconChevronDown,
  IconChevronRight,
  IconNotebook,
  IconPlus,
  IconSettings,
  IconTrash,
  IconCheck,
  IconFileOff,
  IconGripVertical,
  IconLoader2,
  IconEyeOff,
} from "@tabler/icons-react";
import { countWordsInContent } from "@/utils/word-count";

interface NotebookSwitcherProps {
  onNewNotebook: () => void;
  onEditNotebook: (notebook: Notebook) => void;
  onDeleteNotebook: (notebook: Notebook) => void;
}

export default function NotebookSwitcher({
  onNewNotebook,
  onEditNotebook,
  onDeleteNotebook,
}: NotebookSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  const notebooks = useNotebooks();
  const activeNotebook = useActiveNotebook();
  const {
    activeNotebookId,
    setActiveNotebookId,
    notebookCounts,
    looseNotesCount,
    notes,
    isAuthenticated,
    notebooksLoading,
    setNotebooks,
  } = useNotesStore();

  const getNotebookWordCount = (notebookId: string) => {
    return notes
      .filter((n) => n.notebookId === notebookId)
      .reduce((total, n) => total + countWordsInContent(n.content), 0);
  };

  const totalNotesCount = notes.filter((n) => n.source === "supabase").length;
  const hiddenNotebookCount = notebooks.filter((nb) => nb.isHidden && !nb.parentId).length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (!isAuthenticated) return null;

  const handleSelect = (id: string | null) => {
    setActiveNotebookId(id);
    setIsOpen(false);
  };

  const getDisplayName = () => {
    if (activeNotebookId === null) return "All Notes";
    if (activeNotebookId === "loose") return "Loose Notes";
    return activeNotebook?.name || "Unknown";
  };

  const notebookLimitReached = notebooks.length >= NOTEBOOK_LIMITS.free;

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
    if (!draggedId || draggedId === targetId) { setDraggedId(null); return; }

    const from = notebooks.findIndex((nb) => nb.id === draggedId);
    const to = notebooks.findIndex((nb) => nb.id === targetId);
    if (from === -1 || to === -1) { setDraggedId(null); return; }

    const reordered = [...notebooks];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const updated = reordered.map((nb, i) => ({ ...nb, displayOrder: i }));

    setNotebooks(updated);
    setDraggedId(null);
    await reorderNotebooks(updated.map((nb) => ({ id: nb.id, order: nb.displayOrder })));
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={notebooksLoading}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-active)] rounded-[var(--radius-md)] transition-colors duration-[var(--duration-fast)] disabled:opacity-50"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {notebooksLoading ? (
            <IconLoader2 size={13} className="text-[var(--color-text-tertiary)] animate-spin" />
          ) : (
            <IconNotebook size={13} className="text-[var(--color-text-tertiary)]" />
          )}
          <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">
            {notebooksLoading ? "Loading..." : getDisplayName()}
          </span>
        </div>
        <IconChevronDown
          size={12}
          className={`text-[var(--color-text-tertiary)] transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] border border-[var(--color-border-primary)] z-50 overflow-hidden max-h-[60vh] overflow-y-auto">
          <button
            onClick={() => handleSelect(null)}
            className="w-full flex items-center justify-between px-2.5 min-h-[40px] hover:bg-[var(--color-hover)] transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <IconNotebook size={14} className="text-[var(--color-text-tertiary)]" />
              <span className="text-xs text-[var(--color-text-primary)]">All Notes</span>
              <span className="text-[10px] text-[var(--color-text-tertiary)]">{totalNotesCount}</span>
            </div>
            {activeNotebookId === null && <IconCheck size={14} className="text-[var(--color-accent)]" />}
          </button>
          {hiddenNotebookCount > 0 && activeNotebookId === null && (
            <div className="px-2.5 py-1 flex items-center gap-1.5 text-[10px] text-[var(--color-text-tertiary)]">
              <IconEyeOff size={10} />
              <span>{hiddenNotebookCount} hidden notebook{hiddenNotebookCount !== 1 ? "s" : ""}</span>
            </div>
          )}

          <button
            onClick={() => handleSelect("loose")}
            className="w-full flex items-center justify-between px-2.5 min-h-[40px] hover:bg-[var(--color-hover)] transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <IconFileOff size={14} className="text-[var(--color-text-tertiary)]" />
              <span className="text-xs text-[var(--color-text-primary)]">Loose Notes</span>
              <span className="text-[10px] text-[var(--color-text-tertiary)]">{looseNotesCount}</span>
            </div>
            {activeNotebookId === "loose" && <IconCheck size={14} className="text-[var(--color-accent)]" />}
          </button>

          {notebooks.length > 0 && <div className="h-px bg-[var(--color-border-secondary)] my-0.5" />}

          {notebooksLoading ? (
            <div className="px-2.5 py-3 text-center text-[10px] text-[var(--color-text-tertiary)]">
              Loading...
            </div>
          ) : (
            (() => {
              const rootNotebooks = notebooks.filter((nb) => !nb.parentId);
              const childrenOf = (parentId: string) =>
                notebooks.filter((nb) => nb.parentId === parentId);

              const renderNotebook = (notebook: Notebook, depth: number, parentHidden = false) => {
                const children = childrenOf(notebook.id);
                const hasChildren = children.length > 0;
                const isCollapsed = collapsedIds.has(notebook.id);
                const childNoteCount = children.reduce(
                  (sum, c) => sum + (notebookCounts[c.id] || 0),
                  0,
                );
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
                      onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                      className={`group/nb flex items-center ${
                        draggedId === notebook.id ? "opacity-40" : ""
                      } ${dragOverId === notebook.id ? "bg-[var(--color-accent-subtle)]" : ""} ${
                        effectivelyHidden ? "opacity-50" : ""
                      }`}
                      style={{ paddingLeft: depth * 12 }}
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
                          className="pl-1 py-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                        >
                          {isCollapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
                        </button>
                      ) : (
                        <div className="pl-1 py-2 cursor-grab text-[var(--color-text-tertiary)] opacity-0 group-hover/nb:opacity-50">
                          <IconGripVertical size={12} />
                        </div>
                      )}
                      <button
                        onClick={() => handleSelect(notebook.id)}
                        className="flex-1 flex items-center justify-between px-1.5 min-h-[36px] hover:bg-[var(--color-hover)] transition-colors min-w-0"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {effectivelyHidden && <IconEyeOff size={10} className="text-[var(--color-text-tertiary)] flex-shrink-0" />}
                          <span className="text-xs text-[var(--color-text-primary)] truncate">{notebook.name}</span>
                          <span className="text-[10px] text-[var(--color-text-tertiary)]">
                            {hasChildren ? totalCount : notebookCounts[notebook.id] || 0}
                          </span>
                          {(() => {
                            const wc = getNotebookWordCount(notebook.id);
                            if (notebook.wordGoal > 0) {
                              const pct = Math.min(100, Math.round((wc / notebook.wordGoal) * 100));
                              return (
                                <span className="flex items-center gap-1 text-[9px] text-[var(--color-text-tertiary)]" title={`${wc.toLocaleString()} / ${notebook.wordGoal.toLocaleString()} words`}>
                                  <span className="inline-block w-6 h-1 rounded-full bg-[var(--color-border-primary)] overflow-hidden">
                                    <span className="block h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
                                  </span>
                                  {pct}%
                                </span>
                              );
                            }
                            if (wc > 0) {
                              return (
                                <span className="text-[9px] text-[var(--color-text-tertiary)]" title={`${wc.toLocaleString()} words`}>
                                  {wc.toLocaleString()}w
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        {activeNotebookId === notebook.id && <IconCheck size={12} className="text-[var(--color-accent)] flex-shrink-0" />}
                      </button>
                      <div className="flex items-center pr-1.5 opacity-0 group-hover/nb:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setIsOpen(false); onEditNotebook(notebook); }}
                          className="p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] rounded transition-colors"
                          title="Edit"
                        >
                          <IconSettings size={11} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setIsOpen(false); onDeleteNotebook(notebook); }}
                          className="p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] rounded transition-colors"
                          title="Delete"
                        >
                          <IconTrash size={11} />
                        </button>
                      </div>
                    </div>
                    {hasChildren && !isCollapsed && children.map((child) => renderNotebook(child, depth + 1, effectivelyHidden))}
                  </React.Fragment>
                );
              };

              return rootNotebooks.map((nb) => renderNotebook(nb, 0));
            })()
          )}

          <div className="h-px bg-[var(--color-border-secondary)] my-0.5" />

          <button
            onClick={() => { setIsOpen(false); onNewNotebook(); }}
            disabled={notebookLimitReached}
            className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${
              notebookLimitReached
                ? "text-[var(--color-text-tertiary)] cursor-not-allowed"
                : "text-[var(--color-accent)] hover:bg-[var(--color-hover)]"
            }`}
          >
            <IconPlus size={12} />
            New Notebook
          </button>
        </div>
      )}
    </div>
  );
}
