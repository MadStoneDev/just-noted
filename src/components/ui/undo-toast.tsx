"use client";

import React, { useEffect, useState } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { IconTrash, IconArrowBackUp, IconX } from "@tabler/icons-react";

const UNDO_TIMEOUT = 10000; // 10 seconds to undo

export default function UndoDeleteToast() {
  const { recentlyDeleted, restoreDeletedNote, clearRecentlyDeleted } = useNotesStore();
  const [progress, setProgress] = useState(100);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (recentlyDeleted) {
      setIsVisible(true);
      setProgress(100);

      // Animate progress bar
      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 100 - (elapsed / UNDO_TIMEOUT) * 100);
        setProgress(remaining);

        if (remaining <= 0) {
          clearInterval(interval);
        }
      }, 50);

      return () => clearInterval(interval);
    } else {
      setIsVisible(false);
    }
  }, [recentlyDeleted]);

  const handleUndo = () => {
    restoreDeletedNote();
  };

  const handleDismiss = () => {
    clearRecentlyDeleted();
  };

  if (!isVisible || !recentlyDeleted) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="relative bg-[var(--color-bg-elevated)] border border-[var(--color-border-primary)] text-[var(--color-text-primary)] px-4 py-3 rounded-[var(--radius-xl)] shadow-lg flex items-center gap-3 min-w-[280px] max-w-sm">
        <IconTrash size={16} className="text-[var(--color-danger)] flex-shrink-0" />
        <p className="flex-1 text-sm truncate">
          &ldquo;{recentlyDeleted.note.title}&rdquo; deleted
        </p>
        <button
          onClick={handleUndo}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[var(--color-accent)] text-[var(--color-text-on-accent)] rounded-[var(--radius-md)] hover:bg-[var(--color-accent-hover)] transition-colors shrink-0"
        >
          <IconArrowBackUp size={14} />
          Undo
        </button>
        <button
          onClick={handleDismiss}
          className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <IconX size={14} />
        </button>
        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl overflow-hidden">
          <div
            className="h-full bg-[var(--color-accent)] transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
