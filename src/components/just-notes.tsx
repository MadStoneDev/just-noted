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
  const isInitialLoad = useRef(true);
  const optimisticNoteAdded = useRef(false);
  const optimisticNoteId = useRef<string | null>(null);
  const retryCount = useRef(0);
  const MAX_RETRIES = 3;

  // Sort notes function - pinned notes first, then by createdAt (most recent first)
  const sortNotes = (notesToSort: Note[]): Note[] => {
    return [...notesToSort].sort((a, b) => {
      // First sort by pin status (pinned notes first)
      if ((a.pinned || false) && !(b.pinned || false)) return -1;
      if (!(a.pinned || false) && (b.pinned || false)) return 1;

      // For pinned notes, sort by updatedAt (most recent first)
      if ((a.pinned || false) && (b.pinned || false)) {
        const aTime = a.updatedAt || 0;
        const bTime = b.updatedAt || 0;
        return bTime - aTime;
      }

      // For unpinned notes, sort by createdAt (most recent first)
      const aCreate = a.createdAt || 0;
      const bCreate = b.createdAt || 0;
      return bCreate - aCreate;
    });
  };

  // Load notes from Redis on initial mount
  useEffect(() => {
    const loadNotes = async () => {
      try {
        const id = getUserId();
        setUserId(id);

        // First, show a default note immediately (optimistic UI)
        const optimisticNote = JSON.parse(JSON.stringify(defaultNote));
        optimisticNote.id = generateNoteId([]);
        optimisticNoteId.current = optimisticNote.id;

        // Show the note immediately
        setNotes([optimisticNote]);
        setIsLoading(false);

        // Then check Redis in the background
        const result = await getNotesByUserIdAction(id);

        if (isMounted.current) {
          if (result.success && result.notes && result.notes.length > 0) {
            // Add createdAt if missing (for existing notes in the database)
            const notesWithCreatedAt = result.notes.map((note) => {
              if (!note.createdAt) {
                return {
                  ...note,
                  createdAt: note.updatedAt || Date.now(), // Fall back to updatedAt or current time
                };
              }
              return note;
            });

            // If we have notes in Redis, use those instead (sorted)
            setNotes(sortNotes(notesWithCreatedAt));
          } else {
            // If no notes in Redis, save our optimistic note to Redis
            optimisticNoteAdded.current = true;
            // but don't wait for this to complete
            addNoteAction(id, optimisticNote)
              .then((result) => {
                if (result.success && result.notes && isMounted.current) {
                  setNotes(sortNotes(result.notes));

                  // Reset retry count on success
                  retryCount.current = 0;
                }
              })
              .catch((error) => {
                console.error("Failed to add default note to Redis:", error);
                // Retry logic for transient errors
                if (retryCount.current < MAX_RETRIES) {
                  retryCount.current++;
                  setTimeout(() => {
                    if (isMounted.current) {
                      addNoteAction(id, optimisticNote).catch((e) =>
                        console.error(`Retry ${retryCount.current} failed:`, e),
                      );
                    }
                  }, 1000 * retryCount.current); // Exponential backoff
                }
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
      } finally {
        isInitialLoad.current = false;
      }
    };

    loadNotes();

    return () => {
      isMounted.current = false;
    };
  }, []);

  // Set up background refresh after initial load
  useEffect(() => {
    if (!userId) return;

    const refreshNotes = async () => {
      try {
        const result = await getNotesByUserIdAction(userId);
        if (result.success && isMounted.current) {
          // Only update state if we have notes from Redis
          // or if our optimistic note has been saved (to prevent the disappearing)
          if (
            (result.notes && result.notes.length > 0) ||
            !optimisticNoteAdded.current
          ) {
            // Sort notes when refreshing
            setNotes(sortNotes(result.notes || []));

            // If we see our optimistic note has been saved to Redis, clear the flag
            if (
              optimisticNoteAdded.current &&
              result.notes?.some((note) => note.id === optimisticNoteId.current)
            ) {
              optimisticNoteAdded.current = false;
              retryCount.current = 0; // Reset retry count once note is confirmed saved
            }
          }
        }
      } catch (error) {
        console.error("Failed to refresh notes:", error);

        // If we're having persistent issues and still have an optimistic note
        // Try to save it again during refresh
        if (
          optimisticNoteAdded.current &&
          retryCount.current < MAX_RETRIES &&
          userId
        ) {
          const optimisticNote = notes.find(
            (note) => note.id === optimisticNoteId.current,
          );
          if (optimisticNote) {
            retryCount.current++;
            console.log(
              `Attempting to save optimistic note again, try ${retryCount.current}`,
            );
            addNoteAction(userId, optimisticNote).catch((e) =>
              console.error(`Refresh retry ${retryCount.current} failed:`, e),
            );
          }
        }
      }
    };

    // Don't refresh immediately after initial load to prevent flicker
    // Only set up the interval for periodic refreshes
    const intervalId = setInterval(refreshNotes, 10000);

    return () => clearInterval(intervalId);
  }, [userId, notes]);

  // Add note function
  const handleAddNote = () => {
    if (animating || !userId) return;

    setAnimating(true);

    // Create new note and show it immediately (optimistic UI)
    const newNote = JSON.parse(JSON.stringify(defaultNote));
    newNote.id = generateNoteId(notes.map((note) => note.id));
    newNote.pinned = false; // New notes are not pinned by default
    setNewNoteId(newNote.id);

    // Get pinned and unpinned notes
    const pinnedNotes = notes.filter((note) => note.pinned);
    const unpinnedNotes = notes.filter((note) => !note.pinned);

    // Add the new note at the top of unpinned notes
    const updatedNotes = [...pinnedNotes, newNote, ...unpinnedNotes];
    setNotes(updatedNotes);

    // Save note to Redis in background, don't block UI
    addNoteAction(userId, newNote)
      .then((result) => {
        if (result.success && result.notes && isMounted.current) {
          setNotes(sortNotes(result.notes));
        }
      })
      .catch((error) => {
        console.error("Failed to add note to Redis:", error);
        // Note remains in UI even if save fails

        // Set up retry for transient errors
        if (retryCount.current < MAX_RETRIES) {
          retryCount.current++;
          setTimeout(() => {
            if (isMounted.current) {
              addNoteAction(userId, newNote).catch((e) =>
                console.error(`Retry ${retryCount.current} failed:`, e),
              );
            }
          }, 1000 * retryCount.current); // Exponential backoff
        }
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

  // Handle pin status change
  const handlePinStatusChange = (noteId: string, isPinned: boolean) => {
    console.log(`Pin status change for note ${noteId}: ${isPinned}`);

    // Find the existing note to preserve its properties
    const existingNote = notes.find((note) => note.id === noteId);
    if (!existingNote) return;

    // Create a new array with the updated note
    const updatedNotes = notes.map((note) =>
      note.id === noteId ? { ...note, pinned: isPinned } : note,
    );

    console.log("Sorting notes after pin status change");
    // Sort notes with the new pin status
    setNotes(sortNotes(updatedNotes));

    // Disable automatic refreshes briefly to prevent flicker
    const disableRefresh = true;
    if (disableRefresh) {
      const prevInterval = window.__noteRefreshInterval;
      if (prevInterval) {
        console.log("Temporarily disabling auto-refresh");
        clearInterval(prevInterval);

        // Re-enable after 5 seconds
        setTimeout(() => {
          console.log("Re-enabling auto-refresh");
          window.__noteRefreshInterval = setInterval(async () => {
            if (userId) {
              console.log("Auto-refreshing notes");
              const result = await getNotesByUserIdAction(userId);
              if (result.success && result.notes) {
                setNotes(sortNotes(result.notes));
              }
            }
          }, 10000);
        }, 5000);
      }
    }
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
              onDelete={(noteId) => {
                setNotes((prevNotes) =>
                  prevNotes.filter((note) => note.id !== noteId),
                );
              }}
              onPinStatusChange={handlePinStatusChange}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
