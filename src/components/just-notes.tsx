"use client";

import React, { useEffect, useState } from "react";

import NoteBlock from "@/components/note-block";
import { defaultNote } from "@/data/defaults/default-note";
import { generateNoteId } from "@/utils/general/notes";
import { Note } from "@/types/notes";
import { IconSquareRoundedPlus } from "@tabler/icons-react";

export default function JustNotes() {
  // States
  const [notes, setNotes] = useState<Note[]>([]);

  // Functions
  const handleAddNote = () => {
    const newNote = JSON.parse(JSON.stringify(defaultNote));
    newNote.id = generateNoteId(notes.map((note) => note.id));

    const newNotes = [newNote, ...notes];
    setNotes(newNotes);
  };

  // Effects
  useEffect(() => {
    if (notes.length === 0) {
      const newNote = JSON.parse(JSON.stringify(defaultNote));
      newNote.id = generateNoteId([]);
      console.log(newNote.id);

      const newNotes = [...notes, newNote];
      setNotes(newNotes);
    }
  }, []);

  return (
    <main className={`grid grid-cols-12 gap-4`}>
      <section className={`col-span-12 flex items-center justify-end`}>
        <button
          type={`button`}
          onClick={handleAddNote}
          className={`p-1 inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-mercedes-primary hover:bg-mercedes-primary transition-all duration-300 ease-in-out`}
        >
          <IconSquareRoundedPlus size={30} strokeWidth={1.5} />
          <span>Add a new note</span>
        </button>
      </section>

      {notes.map((note: Note) => (
        <NoteBlock key={note.id} details={note} />
      ))}
    </main>
  );
}
