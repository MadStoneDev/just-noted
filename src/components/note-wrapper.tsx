"use client";

import React, { useState, useRef, useCallback, useMemo } from "react";

import JustNotes from "@/components/just-notes";
import DistractionFreeNoteBlock from "@/components/distraction-free-note-block";

import {
  IconArrowsMinimize,
  IconViewportNarrow,
  IconViewportWide,
} from "@tabler/icons-react";

import { CombinedNote } from "@/types/combined-notes";
import { NotesErrorBoundary } from "@/components/error-boundary";
import { useCombinedNotes } from "@/hooks/use-combined-notes";

export default function NoteWrapper() {
  // Lift useCombinedNotes to this level so both children share the same state
  const combinedNotesHook = useCombinedNotes();

  // States
  const [activeNote, setActiveNote] = useState<CombinedNote | null>(null);
  const [fullWidth, setFullWidth] = useState(true);
  const [showDistractionFree, setShowDistractionFree] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleShow = useCallback((note: CombinedNote) => {
    setActiveNote(note);
    setShowDistractionFree(true);

    requestAnimationFrame(() => {
      setIsAnimating(true);
    });
  }, []);

  const handleHide = useCallback(() => {
    setIsAnimating(false);

    setTimeout(() => {
      setShowDistractionFree(false);
      setActiveNote(null);
    }, 300);
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
      {/* Pass the entire hook down to JustNotes */}
      <JustNotes
        openDistractionFreeNote={handleShow}
        combinedNotesHook={combinedNotesHook}
      />

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
              >
                {widthButtonIcon}
                <span className="hidden sm:block">{widthButtonText}</span>
              </button>

              <button
                className="cursor-pointer px-4 py-2 flex items-center gap-2 rounded-full bg-white/90 hover:bg-white shadow-lg opacity-80 hover:opacity-100 transition-all duration-200 ease-in-out"
                onClick={handleHide}
              >
                <IconArrowsMinimize size={18} strokeWidth={2} />
                <span className="hidden sm:block">
                  Close Distraction-Free Mode
                </span>
              </button>
            </div>

            {/* Pass the hook and activeNote down */}
            <DistractionFreeNoteBlock
              note={activeNote}
              fullWidth={fullWidth}
              combinedNotesHook={combinedNotesHook}
            />
          </article>
        </section>
      )}
    </NotesErrorBoundary>
  );
}
