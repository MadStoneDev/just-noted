"use client";

import React from "react";
import { useNotesStore, useActiveNotebook } from "@/stores/notes-store";
import { getCoverPreviewColor, getCoverStyle } from "@/lib/notebook-covers";
import NotebookExportButton from "./notebook-export-button";
import { IconArrowLeft, IconSettings, IconFileOff } from "@tabler/icons-react";

interface NotebookBreadcrumbProps {
  onEditNotebook?: () => void;
}

export default function NotebookBreadcrumb({ onEditNotebook }: NotebookBreadcrumbProps) {
  const { activeNotebookId, setActiveNotebookId, notebookCounts, looseNotesCount } =
    useNotesStore();
  const activeNotebook = useActiveNotebook();

  // Only show when viewing a specific notebook or loose notes
  if (activeNotebookId === null) {
    return null;
  }

  const isLooseNotes = activeNotebookId === "loose";

  const handleBackClick = () => {
    setActiveNotebookId(null);
  };

  // Loose notes view
  if (isLooseNotes) {
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 border-b border-neutral-200">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackClick}
            className="flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-800 transition-colors"
          >
            <IconArrowLeft size={16} />
            <span>All Notes</span>
          </button>

          <div className="w-px h-5 bg-neutral-300" />

          <div className="flex items-center gap-2">
            <IconFileOff size={18} className="text-neutral-500" />
            <span className="font-medium text-neutral-800">Loose Notes</span>
            <span className="text-xs text-neutral-400">({looseNotesCount})</span>
          </div>
        </div>
      </div>
    );
  }

  // Specific notebook view
  if (!activeNotebook) {
    return null;
  }

  const previewColor = getCoverPreviewColor(
    activeNotebook.coverType,
    activeNotebook.coverValue
  );
  const noteCount = notebookCounts[activeNotebook.id] || 0;

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 border-b border-neutral-200">
      <div className="flex items-center gap-3">
        <button
          onClick={handleBackClick}
          className="flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-800 transition-colors"
        >
          <IconArrowLeft size={16} />
          <span>All Notes</span>
        </button>

        <div className="w-px h-5 bg-neutral-300" />

        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded flex-shrink-0"
            style={{ backgroundColor: previewColor }}
          />
          <span className="font-medium text-neutral-800">{activeNotebook.name}</span>
          <span className="text-xs text-neutral-400">({noteCount})</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* Edit button - more prominent for mobile accessibility */}
        {onEditNotebook && (
          <button
            onClick={onEditNotebook}
            className="p-2.5 text-neutral-600 hover:text-neutral-800 hover:bg-neutral-200 rounded-lg transition-colors"
            title="Edit notebook settings"
            aria-label="Edit notebook settings"
          >
            <IconSettings size={20} />
          </button>
        )}

        {/* Export button */}
        <NotebookExportButton
          notebookId={activeNotebook.id}
          notebookName={activeNotebook.name}
        />
      </div>
    </div>
  );
}

// Notebook cover header - shows when viewing a specific notebook in the sidebar
export function NotebookCoverHeader() {
  const { activeNotebookId, notebookCounts, looseNotesCount } = useNotesStore();
  const activeNotebook = useActiveNotebook();

  // Only show for specific notebook or loose notes
  if (activeNotebookId === null) {
    return null;
  }

  // Loose notes header
  if (activeNotebookId === "loose") {
    return (
      <div className="p-4 bg-neutral-100 rounded-lg mx-4 mt-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-neutral-200 flex items-center justify-center">
            <IconFileOff size={24} className="text-neutral-500" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-800">Loose Notes</h3>
            <p className="text-sm text-neutral-500">
              {looseNotesCount} note{looseNotesCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Specific notebook header
  if (!activeNotebook) {
    return null;
  }

  const noteCount = notebookCounts[activeNotebook.id] || 0;
  const coverStyle = getCoverStyle(activeNotebook.coverType, activeNotebook.coverValue);

  return (
    <div className="mx-4 mt-4 rounded-lg overflow-hidden">
      <div className="relative h-20" style={coverStyle}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="font-semibold text-white text-lg truncate drop-shadow-md">
            {activeNotebook.name}
          </h3>
          <p className="text-sm text-white/80">
            {noteCount} note{noteCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
