"use client";

import React from "react";
import { useNotesStore } from "@/stores/notes-store";
import { IconCloud, IconCloudCheck, IconCloudOff, IconLoader2 } from "@tabler/icons-react";

interface SaveIndicatorProps {
  noteId: string;
  className?: string;
}

export default function SaveIndicator({ noteId, className = "" }: SaveIndicatorProps) {
  const isSaving = useNotesStore((state) => state.isSaving.has(noteId));
  const isEditing = useNotesStore((state) => state.isEditing.has(noteId));
  const hasSaveError = useNotesStore((state) => state.saveError.has(noteId));

  if (hasSaveError) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-red-600 ${className}`}>
        <IconCloudOff size={14} />
        <span>Save failed</span>
      </div>
    );
  }

  if (isSaving) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-neutral-500 ${className}`}>
        <IconLoader2 size={14} className="animate-spin" />
        <span>Saving...</span>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-amber-500 ${className}`}>
        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <span>Unsaved changes</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 text-xs text-green-600 ${className}`}>
      <IconCloudCheck size={14} />
      <span>Saved</span>
    </div>
  );
}

// Global save indicator for all notes
export function GlobalSaveIndicator() {
  const isSaving = useNotesStore((state) => state.isSaving);
  const isEditing = useNotesStore((state) => state.isEditing);

  const savingCount = isSaving.size;
  const editingCount = isEditing.size;

  if (savingCount > 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-neutral-500">
        <IconLoader2 size={14} className="animate-spin" />
        <span>Saving {savingCount} note{savingCount > 1 ? "s" : ""}...</span>
      </div>
    );
  }

  if (editingCount > 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-500">
        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <span>{editingCount} unsaved</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-green-600">
      <IconCloudCheck size={14} />
      <span>All saved</span>
    </div>
  );
}
