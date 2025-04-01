"use client";

import React from "react";
import { useNotes } from "./hooks/use-notes";
import NoteBlock from "@/components/note-block";

import { IconSquareRoundedPlus } from "@tabler/icons-react";

export default function JustNotes() {
  // Use our custom hook for all note functionality
  const {
    notes,
    isLoading,
    animating,
    newNoteId,
    userId,
    addNote,
    updatePinStatus,
    reorderNote,
    deleteNote,
    getNotePositionInfo,
  } = useNotes();

  if (isLoading) {
    return (
      <div className="col-span-12 text-center py-10">Loading your notes...</div>
    );
  }

  return (
    <main className={`grid grid-cols-12 gap-3`}>
      <section className={`col-span-12 flex items-center justify-end`}>
        <button
          type={`button`}
          onClick={addNote}
          disabled={animating}
          className={`px-2 py-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-mercedes-primary hover:bg-mercedes-primary transition-all duration-300 ease-in-out ${
            animating ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <IconSquareRoundedPlus size={30} strokeWidth={1.5} />
          <span>Add a new note</span>
        </button>
      </section>

      <div className="col-span-12 grid grid-cols-12 gap-4 note-container">
        {notes.map((note, index) => {
          // Get position information for each note
          const {
            isFirstPinned,
            isLastPinned,
            isFirstUnpinned,
            isLastUnpinned,
          } = getNotePositionInfo(note.id, note.pinned || false);

          return (
            <div
              key={note.id}
              className={`col-span-12 ${
                note.id === newNoteId
                  ? "animate-slide-in"
                  : animating && index > 0
                    ? "animate-shift-down"
                    : ""
              }`}
            >
              <NoteBlock
                details={note}
                userId={userId || ""}
                showDelete={notes.length > 1}
                onDelete={deleteNote}
                onPinStatusChange={updatePinStatus}
                onReorder={reorderNote}
                isFirstPinned={isFirstPinned}
                isLastPinned={isLastPinned}
                isFirstUnpinned={isFirstUnpinned}
                isLastUnpinned={isLastUnpinned}
              />
            </div>
          );
        })}
      </div>
    </main>
  );
}
