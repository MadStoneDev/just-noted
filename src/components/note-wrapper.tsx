"use client";

import React, { useState, useRef, useCallback } from "react";
import JustNotes from "@/components/just-notes";
import DistractionFreeNoteBlock from "@/components/distraction-free-note-block";
import { IconArrowsMinimize } from "@tabler/icons-react";
import { CombinedNote } from "@/types/combined-notes";
import { AutoBackupProvider } from "@/components/providers/auto-backup-provider";
import { useCombinedNotesWithBackup } from "@/components/hooks/use-combined-notes-with-backup";
import { useCombinedNotes } from "@/components/hooks/use-combined-notes";

export default function NoteWrapper() {
  const { notes } = useCombinedNotes();

  const [activeNote, setActiveNote] = useState<CombinedNote | null>(null);
  const [showDistractionFree, setShowDistractionFree] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const refreshCallbackRef = useRef<(() => Promise<void>) | null>(null);

  const handleShow = useCallback(
    (note: CombinedNote, onRefresh: () => Promise<void>) => {
      setActiveNote(note);
      refreshCallbackRef.current = onRefresh;
      setShowDistractionFree(true);

      // Use requestAnimationFrame for smoother animation
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    },
    [],
  );

  const handleHide = useCallback(async () => {
    // Refresh before closing
    if (refreshCallbackRef.current) {
      await refreshCallbackRef.current();
    }

    setIsAnimating(false);

    // Clean up after animation
    setTimeout(() => {
      setShowDistractionFree(false);
      setActiveNote(null);
      refreshCallbackRef.current = null;
    }, 300); // Reduced from 1200ms for snappier feel
  }, []);

  return (
    <AutoBackupProvider notes={notes}>
      <JustNotes openDistractionFreeNote={handleShow} />

      {showDistractionFree && (
        <section
          className={`fixed inset-0 z-50 transition-opacity duration-300 ease-in-out ${
            isAnimating ? "opacity-100" : "opacity-0"
          }`}
        >
          <div
            className="absolute inset-0 bg-neutral-900/30"
            onClick={handleHide}
          />

          <article className="absolute inset-6 sm:inset-8 p-2 pb-16 rounded-xl bg-neutral-200 overflow-hidden">
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
              <button
                className="cursor-pointer px-4 py-2 flex items-center gap-2 rounded-full bg-white/90 hover:bg-white shadow-lg opacity-80 hover:opacity-100 transition-all duration-200 ease-in-out"
                onClick={handleHide}
              >
                <IconArrowsMinimize size={18} strokeWidth={2} />
                <span>Close Distraction-Free Mode</span>
              </button>
            </div>

            <DistractionFreeNoteBlock note={activeNote} />
          </article>
        </section>
      )}
    </AutoBackupProvider>
  );
}
