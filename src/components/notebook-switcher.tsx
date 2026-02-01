"use client";

import React, { useState, useRef, useEffect } from "react";
import { useNotesStore, useNotebooks, useActiveNotebook } from "@/stores/notes-store";
import { Notebook, NOTEBOOK_LIMITS } from "@/types/notebook";
import { getCoverPreviewColor } from "@/lib/notebook-covers";
import {
  IconChevronDown,
  IconNotebook,
  IconPlus,
  IconSettings,
  IconCheck,
  IconFileOff,
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
}: {
  notebook: Notebook;
  isActive: boolean;
  count: number;
  onSelect: () => void;
}) {
  const previewColor = getCoverPreviewColor(notebook.coverType, notebook.coverValue);

  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center justify-between px-3 py-2 hover:bg-neutral-50 transition-colors"
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
  );
}
