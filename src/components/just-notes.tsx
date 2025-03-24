﻿"use client";

import React, { useEffect, useState, useRef } from "react";

import { Note } from "@/types/notes";
import { defaultNote } from "@/data/defaults/default-note";
import { generateNoteId } from "@/utils/general/notes";

import NoteBlock from "@/components/note-block";
import { getUserId } from "@/utils/general/notes";
import { IconSquareRoundedPlus } from "@tabler/icons-react";

import {
  addNoteAction,
  getNotesByUserIdAction,
} from "@/app/actions/noteActions";

export default function JustNotes() {
  // States
  const [notes, setNotes] = useState<Note[]>([]);
  const [animating, setAnimating] = useState(false);
  const [newNoteId, setNewNoteId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const animationTimeout = useRef<NodeJS.Timeout | null>(null);

  // Effects
  useEffect(() => {
    const initializeUser = async () => {
      try {
        const id = getUserId();
        setUserId(id);

        const result = await getNotesByUserIdAction(id);

        if (result.success && result.notes && result.notes.length > 0) {
          setNotes(result.notes);
        } else {
          const newNote = JSON.parse(JSON.stringify(defaultNote));
          newNote.id = generateNoteId([]);
          setNotes([newNote]);

          await addNoteAction(id, newNote);
        }
      } catch (error) {
        console.error("Failed to load notes:", error);

        const newNote = JSON.parse(JSON.stringify(defaultNote));
        newNote.id = generateNoteId([]);
        setNotes([newNote]);
      } finally {
        setIsLoading(false);
      }
    };

    initializeUser();

    return () => {
      if (animationTimeout.current) {
        clearTimeout(animationTimeout.current);
      }
    };
  }, []);

  const handleAddNote = async () => {
    if (animating || !userId) return;

    setAnimating(true);

    const newNote = JSON.parse(JSON.stringify(defaultNote));
    newNote.id = generateNoteId(notes.map((note) => note.id));
    setNewNoteId(newNote.id);

    const updatedNotes = [newNote, ...notes];
    setNotes(updatedNotes);

    try {
      await addNoteAction(userId, newNote);
    } catch (error) {
      console.error("Failed to add note:", error);
    }

    if (animationTimeout.current) {
      clearTimeout(animationTimeout.current);
    }

    animationTimeout.current = setTimeout(() => {
      setAnimating(false);
      setNewNoteId(null);
    }, 600);
  };

  useEffect(() => {
    if (userId) {
      const refreshNotes = async () => {
        try {
          const result = await getNotesByUserIdAction(userId);
          if (result.success && result.notes) {
            setNotes(result.notes);
          }
        } catch (error) {
          console.error("Failed to refresh notes:", error);
        }
      };

      const interval = setInterval(refreshNotes, 5000);

      return () => clearInterval(interval);
    }
  }, [userId]);

  if (isLoading) {
    return (
      <div className="col-span-12 text-center py-10">Loading your notes...</div>
    );
  }

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
            <NoteBlock
              details={note}
              userId={userId || ""}
              showDelete={notes.length > 1}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
