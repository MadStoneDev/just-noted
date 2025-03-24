"use client";

import React, { useEffect, useState, useRef } from "react";
import NoteBlock from "@/components/note-block";
import { defaultNote } from "@/data/defaults/default-note";
import { generateNoteId } from "@/utils/general/notes";
import { Note } from "@/types/notes";
import { IconSquareRoundedPlus } from "@tabler/icons-react";

export default function JustNotes() {
  // States
  const [notes, setNotes] = useState<Note[]>([]);
  const [animating, setAnimating] = useState(false);
  const [newNoteId, setNewNoteId] = useState<string | null>(null);
  const animationTimeout = useRef<NodeJS.Timeout | null>(null);

  // Functions
  const handleAddNote = () => {
    if (animating) return;

    setAnimating(true);

    const newNote = JSON.parse(JSON.stringify(defaultNote));
    newNote.id = generateNoteId(notes.map((note) => note.id));
    setNewNoteId(newNote.id);

    setNotes([newNote, ...notes]);

    if (animationTimeout.current) {
      clearTimeout(animationTimeout.current);
    }

    animationTimeout.current = setTimeout(() => {
      setAnimating(false);
      setNewNoteId(null);
    }, 600);
  };

  const handleDeleteNote = (noteId: string) => {
    if (animating) return;

    // If this is the last note, don't delete it
    if (notes.length <= 1) return;

    setAnimating(true);

    setNotes(notes.filter((note) => note.id !== noteId));

    if (animationTimeout.current) {
      clearTimeout(animationTimeout.current);
    }

    animationTimeout.current = setTimeout(() => {
      setAnimating(false);
    }, 600);
  };

  // Effects
  useEffect(() => {
    if (notes.length === 0) {
      const newNote = JSON.parse(JSON.stringify(defaultNote));
      newNote.id = generateNoteId([]);
      setNotes([newNote]);
    }

    // Cleanup timeout on unmount
    return () => {
      if (animationTimeout.current) {
        clearTimeout(animationTimeout.current);
      }
    };
  }, []);

  return (
    <main className={`grid grid-cols-12 gap-4`}>
      <section className={`col-span-12 flex items-center justify-end`}>
        <button
          type={`button`}
          onClick={handleAddNote}
          disabled={animating}
          className={`p-1 inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-mercedes-primary hover:bg-mercedes-primary transition-all duration-300 ease-in-out ${
            animating ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <IconSquareRoundedPlus size={30} strokeWidth={1.5} />
          <span>Add a new note</span>
        </button>
      </section>

      <div className="col-span-12 grid grid-cols-12 gap-4 note-container">
        {notes.map((note: Note, index) => (
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
            <NoteBlock details={note} onDelete={handleDeleteNote} />
          </div>
        ))}
      </div>
    </main>
  );
}
