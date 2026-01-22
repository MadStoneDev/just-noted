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
      <div className="bg-neutral-800 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-4 min-w-[300px] max-w-md">
        <div className="flex items-center gap-3 flex-1">
          <IconTrash size={20} className="text-neutral-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              "{recentlyDeleted.note.title}" deleted
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleUndo}
            className="flex items-center gap-1 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-sm font-medium"
          >
            <IconArrowBackUp size={16} />
            Undo
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            aria-label="Dismiss"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-700 rounded-b-xl overflow-hidden">
          <div
            className="h-full bg-mercedes-primary transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
