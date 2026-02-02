"use client";

import React, { useState, useRef, useEffect } from "react";
import { useNotesStore, useNotebooks, useActiveNotebook } from "@/stores/notes-store";
import { Notebook, NOTEBOOK_LIMITS } from "@/types/notebook";
import { reorderNotebooks } from "@/app/actions/notebookActions";
import { getCoverPreviewColor } from "@/lib/notebook-covers";
import {
  IconChevronDown,
  IconNotebook,
  IconPlus,
  IconSettings,
  IconCheck,
  IconFileOff,
  IconGripVertical,
} from "@tabler/icons-react";

interface NotebookSwitcherProps {
  onNewNotebook: () => void;
  onManageNotebooks: () => void;
}

export default function NotebookSwitcher({
  onNewNotebook,
  onManageNotebooks,
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
    setNotebooks,
  } = useNotesStore();

  // Calculate total notes count
  const totalNotesCount = notes.filter((n) => n.source === "supabase").length;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Don't show for non-authenticated users
  if (!isAuthenticated) {
    return null;
  }

  const handleSelect = (id: string | null) => {
    setActiveNotebookId(id);
    setIsOpen(false);
  };

  const getDisplayName = () => {
    if (activeNotebookId === null) {
      return "All Notes";
    }
    if (activeNotebookId === "loose") {
      return "Loose Notes";
    }
    return activeNotebook?.name || "Unknown";
  };

  const getDisplayIcon = () => {
    if (activeNotebookId === null) {
      return <IconNotebook size={18} className="text-neutral-600" />;
    }
    if (activeNotebookId === "loose") {
      return <IconFileOff size={18} className="text-neutral-500" />;
    }
    if (activeNotebook) {
      return (
        <div
          className="w-4 h-4 rounded-sm flex-shrink-0"
          style={{
            backgroundColor: getCoverPreviewColor(
              activeNotebook.coverType,
              activeNotebook.coverValue
            ),
          }}
        />
      );
    }
    return <IconNotebook size={18} className="text-neutral-600" />;
  };

  const notebookLimitReached = notebooks.length >= NOTEBOOK_LIMITS.free;

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, notebookId: string) => {
    setDraggedId(notebookId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", notebookId);
  };

  const handleDragOver = (e: React.DragEvent, notebookId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggedId && notebookId !== draggedId) {
      setDragOverId(notebookId);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);

    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }

    // Find indices
    const draggedIndex = notebooks.findIndex((nb) => nb.id === draggedId);
    const targetIndex = notebooks.findIndex((nb) => nb.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedId(null);
      return;
    }

    // Reorder locally (optimistic update)
    const newNotebooks = [...notebooks];
    const [removed] = newNotebooks.splice(draggedIndex, 1);
    newNotebooks.splice(targetIndex, 0, removed);

    // Update display orders
    const updatedNotebooks = newNotebooks.map((nb, index) => ({
      ...nb,
      displayOrder: index,
    }));

    setNotebooks(updatedNotebooks);
    setDraggedId(null);

    // Persist to database
    const updates = updatedNotebooks.map((nb) => ({
      id: nb.id,
      order: nb.displayOrder,
    }));

    const result = await reorderNotebooks(updates);
    if (!result.success) {
      console.error("Failed to reorder notebooks:", result.error);
      // Could revert here, but for now just log
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {getDisplayIcon()}
          <span className="font-medium text-neutral-800 truncate">
            {getDisplayName()}
          </span>
        </div>
        <IconChevronDown
          size={18}
          className={`text-neutral-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-neutral-200 z-50 overflow-hidden">
          {/* All Notes option */}
          <button
            onClick={() => handleSelect(null)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <IconNotebook size={18} className="text-neutral-600" />
              <span className="text-neutral-800">All Notes</span>
              <span className="text-xs text-neutral-400">({totalNotesCount})</span>
            </div>
            {activeNotebookId === null && (
              <IconCheck size={16} className="text-mercedes-primary" />
            )}
          </button>

          {/* Loose Notes option */}
          <button
            onClick={() => handleSelect("loose")}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <IconFileOff size={18} className="text-neutral-500" />
              <span className="text-neutral-800">Loose Notes</span>
              <span className="text-xs text-neutral-400">({looseNotesCount})</span>
            </div>
            {activeNotebookId === "loose" && (
              <IconCheck size={16} className="text-mercedes-primary" />
            )}
          </button>

          {/* Divider */}
          {notebooks.length > 0 && (
            <div className="border-t border-neutral-200 my-1" />
          )}

          {/* Notebooks list */}
          {notebooks.map((notebook) => (
            <NotebookOption
              key={notebook.id}
              notebook={notebook}
              isActive={activeNotebookId === notebook.id}
              count={notebookCounts[notebook.id] || 0}
              onSelect={() => handleSelect(notebook.id)}
              isDragging={draggedId === notebook.id}
              isDragOver={dragOverId === notebook.id}
              onDragStart={(e) => handleDragStart(e, notebook.id)}
              onDragOver={(e) => handleDragOver(e, notebook.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, notebook.id)}
              onDragEnd={handleDragEnd}
            />
          ))}

          {/* Divider */}
          <div className="border-t border-neutral-200 my-1" />

          {/* New Notebook */}
          <button
            onClick={() => {
              setIsOpen(false);
              onNewNotebook();
            }}
            disabled={notebookLimitReached}
            className={`w-full flex items-center gap-2 px-3 py-2 transition-colors ${
              notebookLimitReached
                ? "text-neutral-400 cursor-not-allowed"
                : "text-mercedes-primary hover:bg-neutral-50"
            }`}
          >
            <IconPlus size={18} />
            <span>New Notebook</span>
            {notebookLimitReached && (
              <span className="text-xs text-neutral-400 ml-auto">
                Limit reached
              </span>
            )}
          </button>

          {/* Manage Notebooks */}
          <button
            onClick={() => {
              setIsOpen(false);
              onManageNotebooks();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            <IconSettings size={18} />
            <span>Manage Notebooks</span>
          </button>

          {/* Limit warning */}
          {notebookLimitReached && (
            <div className="px-3 py-2 bg-amber-50 text-xs text-amber-700 border-t border-amber-100">
              You&apos;ve reached the free limit of {NOTEBOOK_LIMITS.free} notebooks.
              Upgrade for more.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Individual notebook option in the dropdown
function NotebookOption({
  notebook,
  isActive,
  count,
  onSelect,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  notebook: Notebook;
  isActive: boolean;
  count: number;
  onSelect: () => void;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const previewColor = getCoverPreviewColor(notebook.coverType, notebook.coverValue);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`flex items-center transition-all ${
        isDragging ? "opacity-50" : ""
      } ${isDragOver ? "bg-mercedes-primary/10 border-t-2 border-mercedes-primary" : ""}`}
    >
      <div className="px-1 py-2 cursor-grab text-neutral-400 hover:text-neutral-600">
        <IconGripVertical size={14} />
      </div>
      <button
        onClick={onSelect}
        className="flex-1 flex items-center justify-between px-2 py-2 hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-4 h-4 rounded-sm flex-shrink-0"
            style={{ backgroundColor: previewColor }}
          />
          <span className="text-neutral-800 truncate">{notebook.name}</span>
          <span className="text-xs text-neutral-400">({count})</span>
        </div>
        {isActive && <IconCheck size={16} className="text-mercedes-primary flex-shrink-0" />}
      </button>
    </div>
  );
}
