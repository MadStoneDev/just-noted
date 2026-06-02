"use client";

import React, { useState, useRef, useEffect } from "react";
import { useNotesStore, useNotebooks, useActiveNotebook } from "@/stores/notes-store";
import { Notebook, NOTEBOOK_LIMITS } from "@/types/notebook";
import { reorderNotebooks } from "@/app/actions/notebookActions";
import {
  IconChevronDown,
  IconNotebook,
  IconPlus,
  IconSettings,
  IconTrash,
  IconCheck,
  IconFileOff,
  IconGripVertical,
  IconLoader2,
} from "@tabler/icons-react";

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

  const totalNotesCount = notes.filter((n) => n.source === "supabase").length;

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
        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] border border-[var(--color-border-primary)] z-50 overflow-hidden">
          <button
            onClick={() => handleSelect(null)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-[var(--color-hover)] transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <IconNotebook size={12} className="text-[var(--color-text-tertiary)]" />
              <span className="text-xs text-[var(--color-text-primary)]">All Notes</span>
              <span className="text-[10px] text-[var(--color-text-tertiary)]">{totalNotesCount}</span>
            </div>
            {activeNotebookId === null && <IconCheck size={12} className="text-[var(--color-accent)]" />}
          </button>

          <button
            onClick={() => handleSelect("loose")}
            className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-[var(--color-hover)] transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <IconFileOff size={12} className="text-[var(--color-text-tertiary)]" />
              <span className="text-xs text-[var(--color-text-primary)]">Loose Notes</span>
              <span className="text-[10px] text-[var(--color-text-tertiary)]">{looseNotesCount}</span>
            </div>
            {activeNotebookId === "loose" && <IconCheck size={12} className="text-[var(--color-accent)]" />}
          </button>

          {notebooks.length > 0 && <div className="h-px bg-[var(--color-border-secondary)] my-0.5" />}

          {notebooksLoading ? (
            <div className="px-2.5 py-3 text-center text-[10px] text-[var(--color-text-tertiary)]">
              Loading...
            </div>
          ) : (
            notebooks.map((notebook) => (
              <div
                key={notebook.id}
                draggable
                onDragStart={(e) => handleDragStart(e, notebook.id)}
                onDragOver={(e) => handleDragOver(e, notebook.id)}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => handleDrop(e, notebook.id)}
                onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                className={`group/nb flex items-center ${
                  draggedId === notebook.id ? "opacity-40" : ""
                } ${dragOverId === notebook.id ? "bg-[var(--color-accent-subtle)]" : ""}`}
              >
                <div className="pl-1 py-1.5 cursor-grab text-[var(--color-text-tertiary)] opacity-0 group-hover/nb:opacity-50">
                  <IconGripVertical size={10} />
                </div>
                <button
                  onClick={() => handleSelect(notebook.id)}
                  className="flex-1 flex items-center justify-between px-1.5 py-1.5 hover:bg-[var(--color-hover)] transition-colors min-w-0"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs text-[var(--color-text-primary)] truncate">{notebook.name}</span>
                    <span className="text-[10px] text-[var(--color-text-tertiary)]">{notebookCounts[notebook.id] || 0}</span>
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
            ))
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
