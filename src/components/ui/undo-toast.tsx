"use client";

import React, { useEffect, useState } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { IconTrash, IconArrowBackUp, IconX } from "@tabler/icons-react";

const UNDO_TIMEOUT = 10000; // 10 seconds to undo

// The note is already deleted on the server when this shows; the toast is
// only the window in which Undo can restore it. ✕ just hides the toast.
// After a failed guest restore it offers Try again and Discard; the snapshot
// is kept (utils/failed-restores) until one of them succeeds, so ✕ only hides
// it and the next load offers it again.
export default function UndoDeleteToast({
  onUndo,
  onDiscard,
}: {
  onUndo: () => void | Promise<void>;
  onDiscard?: () => void | Promise<void>;
}) {
  const recentlyDeleted = useNotesStore((s) => s.recentlyDeleted);
  const clearRecentlyDeleted = useNotesStore((s) => s.clearRecentlyDeleted);
  const [progress, setProgress] = useState(100);
  const [isVisible, setIsVisible] = useState(false);

  const failed = !!recentlyDeleted?.restoreFailed;

  useEffect(() => {
    if (recentlyDeleted?.restoreFailed) {
      // No countdown: it stays until Try again or ✕.
      setIsVisible(true);
      setProgress(0);
      return;
    }
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
    void onUndo();
  };

  const handleDismiss = () => {
    clearRecentlyDeleted();
  };

  if (!isVisible || !recentlyDeleted) return null;

  return (
    // The toast layer (z-[10050], as the other toasts): above the consent
    // banner, the update banner and every other fixed bottom bar, so Undo and
    // ✕ are always clickable.
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10050] animate-slide-up">
      <div role={failed ? "alert" : "status"} className="relative bg-[var(--color-bg-elevated)] border border-[var(--color-border-primary)] text-[var(--color-text-primary)] px-4 py-3 rounded-[var(--radius-xl)] shadow-lg flex items-center gap-3 min-w-[280px] max-w-sm">
        <IconTrash size={16} className="text-[var(--color-danger)] flex-shrink-0" />
        <p className="flex-1 text-sm truncate">
          {failed ? "Couldn't restore. Try again." : <>&ldquo;{recentlyDeleted.note.title}&rdquo; moved to Trash</>}
        </p>
        <button
          onClick={handleUndo}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[var(--color-accent)] text-[var(--color-text-on-accent)] rounded-[var(--radius-md)] hover:bg-[var(--color-accent-hover)] transition-colors shrink-0"
        >
          <IconArrowBackUp size={14} />
          {failed ? "Try again" : "Undo"}
        </button>
        {failed && onDiscard && (
          <button
            onClick={() => void onDiscard()}
            className="px-2.5 py-1 text-xs font-medium text-[var(--color-danger)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors shrink-0"
          >
            Discard
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors shrink-0"
          aria-label={failed ? "Hide (keeps the note for later)" : "Dismiss"}
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
