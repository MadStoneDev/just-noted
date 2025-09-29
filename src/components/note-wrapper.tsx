"use client";

import React, { useState, useRef, useCallback, useMemo } from "react";
import JustNotes from "@/components/just-notes";
import DistractionFreeNoteBlock from "@/components/distraction-free-note-block";
import { NotesErrorBoundary } from "@/components/error-boundary";
import {
  IconArrowsMinimize,
  IconViewportNarrow,
  IconViewportWide,
} from "@tabler/icons-react";
import { CombinedNote } from "@/types/combined-notes";
import { AutoBackupProvider } from "@/components/providers/auto-backup-provider";
// REMOVED: Don't call useCombinedNotes here - JustNotes already does it

export default function NoteWrapper() {
  // REMOVED: const { notes, refreshNotes } = useCombinedNotes();
  // JustNotes will handle this internally

  const [activeNote, setActiveNote] = useState<CombinedNote | null>(null);
  const [fullWidth, setFullWidth] = useState(true);
  const [showDistractionFree, setShowDistractionFree] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshCallbackRef = useRef<(() => Promise<void>) | null>(null);

  const handleShow = useCallback(
    (note: CombinedNote, onRefresh: () => Promise<void>) => {
      setActiveNote(note);
      refreshCallbackRef.current = onRefresh;
      setShowDistractionFree(true);

      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    },
    [],
  );

  const handleHide = useCallback(async () => {
    setIsAnimating(false);

    setTimeout(() => {
      setShowDistractionFree(false);
      setActiveNote(null);
      refreshCallbackRef.current = null;
    }, 300);

    // Trigger refresh after closing
    setIsRefreshing(true);
    try {
      if (refreshCallbackRef.current) {
        await refreshCallbackRef.current();
      }
    } catch (error) {
      console.error("Failed to refresh note on close:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleToggleWidth = useCallback(() => {
    setFullWidth((prev) => !prev);
  }, []);

  const widthButtonText = useMemo(
    () => (fullWidth ? "Compact" : "Expanded"),
    [fullWidth],
  );

  const widthButtonIcon = useMemo(
    () =>
      fullWidth ? (
        <IconViewportNarrow size={18} strokeWidth={2} />
      ) : (
        <IconViewportWide size={18} strokeWidth={2} />
      ),
    [fullWidth],
  );

  return (
    <NotesErrorBoundary>
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
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex justify-center items-center gap-2 w-full z-10">
              <button
                className="cursor-pointer px-4 py-2 flex items-center gap-2 rounded-full bg-white/90 hover:bg-white shadow-lg opacity-80 hover:opacity-100 transition-all duration-200 ease-in-out"
                onClick={handleToggleWidth}
                disabled={isRefreshing}
              >
                {widthButtonIcon}
                <span className="hidden sm:block">{widthButtonText}</span>
              </button>

              <button
                className={`cursor-pointer px-4 py-2 flex items-center gap-2 rounded-full bg-white/90 hover:bg-white shadow-lg transition-all duration-200 ease-in-out ${
                  isRefreshing ? "opacity-50" : "opacity-80 hover:opacity-100"
                }`}
                onClick={handleHide}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-mercedes-primary border-t-transparent"></div>
                    <span className="hidden sm:block">Saving...</span>
                  </>
                ) : (
                  <>
                    <IconArrowsMinimize size={18} strokeWidth={2} />
                    <span className="hidden sm:block">
                      Close Distraction-Free Mode
                    </span>
                  </>
                )}
              </button>
            </div>

            <DistractionFreeNoteBlock note={activeNote} fullWidth={fullWidth} />
          </article>
        </section>
      )}
    </NotesErrorBoundary>
  );
}
