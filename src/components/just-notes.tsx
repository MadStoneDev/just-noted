"use client";

import React, { useEffect, useState, useRef } from "react";

import { Note } from "@/types/notes";
import NoteBlock from "@/components/note-block";
import { defaultNote } from "@/data/defaults/default-note";
import { getUserId, generateNoteId } from "@/utils/general/notes";

import { IconSquareRoundedPlus } from "@tabler/icons-react";

import {
  addNoteAction,
  getNotesByUserIdAction,
} from "@/app/actions/noteActions";

export default function JustNotes() {
  // States
  const [notes, setNotes] = useState<Note[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [newNoteId, setNewNoteId] = useState<string | null>(null);
  const animationTimeout = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);

  // Load notes from Redis
  useEffect(() => {
    const loadNotes = async () => {
      try {
        const id = getUserId();
        setUserId(id);

        // First, show a default note immediately (optimistic UI)
        const optimisticNote = JSON.parse(JSON.stringify(defaultNote));
        optimisticNote.id = generateNoteId([]);

        // Show the note immediately
        setNotes([optimisticNote]);
        setIsLoading(false);

        // Then check Redis in the background
        const result = await getNotesByUserIdAction(id);

        if (isMounted.current) {
          if (result.success && result.notes && result.notes.length > 0) {
            // If we have notes in Redis, use those instead
            setNotes(result.notes);
          } else {
            // If no notes in Redis, save our optimistic note to Redis
            // but don't wait for this to complete
            addNoteAction(id, optimisticNote).catch((error) => {
              console.error("Failed to add default note to Redis:", error);
              // Continue showing the optimistic note even if save fails
            });
          }
        }
      } catch (error) {
        console.error("Failed to load notes:", error);
        // We already have the optimistic note displayed, just log the error

        // Make sure we're not stuck in loading state
        if (isMounted.current && isLoading) {
          setIsLoading(false);
        }
      }
    };

    loadNotes();

    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    const refreshNotes = async () => {
      try {
        const result = await getNotesByUserIdAction(userId);
        if (result.success && result.notes && isMounted.current) {
          setNotes(result.notes);
        }
      } catch (error) {
        console.error("Failed to refresh notes:", error);
      }
    };

    // Initial refresh
    refreshNotes();

    // Set up interval for periodic refreshes
    const intervalId = setInterval(refreshNotes, 10000);

    return () => clearInterval(intervalId);
  }, [userId]);

  // Add note function
  const handleAddNote = () => {
    if (animating || !userId) return;

    setAnimating(true);

    // Create new note and show it immediately (optimistic UI)
    const newNote = JSON.parse(JSON.stringify(defaultNote));
    newNote.id = generateNoteId(notes.map((note) => note.id));
    setNewNoteId(newNote.id);

    const updatedNotes = [newNote, ...notes];
    setNotes(updatedNotes);

    // Save note to Redis in background, don't block UI
    addNoteAction(userId, newNote).catch((error) => {
      console.error("Failed to add note to Redis:", error);
      // Note remains in UI even if save fails
    });

    // Handle animation timing
    if (animationTimeout.current) {
      clearTimeout(animationTimeout.current);
    }

    animationTimeout.current = setTimeout(() => {
      if (isMounted.current) {
        setAnimating(false);
        setNewNoteId(null);
      }
    }, 600);
  };

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
          onClick={handleAddNote}
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
