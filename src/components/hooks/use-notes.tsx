"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Note } from "@/types/notes";
import { getUserId, generateNoteId } from "@/utils/general/notes";
import {
  addNoteAction,
  getNotesByUserIdAction,
  updateNotePinStatusAction,
  updateNotePrivacyStatusAction,
  updateNoteCollapsedStatusAction,
  reorderNoteAction,
} from "@/app/actions/noteActions";
import { defaultNote } from "@/data/defaults/default-note";

/**
 * Custom hook for managing notes with optimistic UI updates
 *
 * This hook centralizes all note-related logic, handling:
 * - Loading notes from the server
 * - Optimistic UI updates
 * - Sorting notes based on pin status and timestamp
 * - Retry logic for network failures
 * - Proper cleanup to prevent memory leaks
 *
 * @returns {Object} Note management functions and state
 */
export function useNotes() {
  // States
  const [notes, setNotes] = useState<Note[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [newNoteId, setNewNoteId] = useState<string | null>(null);

  // Refs
  const animationTimeout = useRef<NodeJS.Timeout | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);
  const isInitialLoad = useRef(true);
  const optimisticNoteAdded = useRef(false);
  const optimisticNoteId = useRef<string | null>(null);
  const retryCount = useRef(0);
  const privacyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const collapsedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_RETRIES = 3;

  /**
   * Sort notes - pinned notes first, then by order/timestamp
   */
  const sortNotes = useCallback((notesToSort: Note[]): Note[] => {
    return [...notesToSort].sort((a, b) => {
      // First sort by pin status (pinned notes first)
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      // If both notes have order values, use them for sorting
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }

      // For pinned notes without order, sort by updatedAt (most recent first)
      if (a.pinned && b.pinned) {
        const aTime = a.updatedAt || 0;
        const bTime = b.updatedAt || 0;
        return bTime - aTime;
      }

      // For unpinned notes without order, sort by createdAt (most recent first)
      const aCreate = a.createdAt || 0;
      const bCreate = b.createdAt || 0;
      return bCreate - aCreate;
    });
  }, []);

  /**
   * Get position info for a note (first/last in its category)
   */
  const getNotePositionInfo = useCallback(
    (noteId: string, pinStatus: boolean) => {
      // Get all pinned and unpinned notes
      const pinnedNotes = notes.filter((note) => note.pinned);
      const unpinnedNotes = notes.filter((note) => !note.pinned);

      if (pinStatus) {
        // For pinned notes
        const pinnedIndex = pinnedNotes.findIndex((note) => note.id === noteId);
        return {
          isFirstPinned: pinnedIndex === 0,
          isLastPinned: pinnedIndex === pinnedNotes.length - 1,
          isFirstUnpinned: false,
          isLastUnpinned: false,
        };
      } else {
        // For unpinned notes
        const unpinnedIndex = unpinnedNotes.findIndex(
          (note) => note.id === noteId,
        );
        return {
          isFirstPinned: false,
          isLastPinned: false,
          isFirstUnpinned: unpinnedIndex === 0,
          isLastUnpinned: unpinnedIndex === unpinnedNotes.length - 1,
        };
      }
    },
    [notes],
  );

  /**
   * Setup refresh interval
   */
  const setupRefreshInterval = useCallback(() => {
    // Clear any existing interval first
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    // No need to set up if userId is not available yet
    if (!userId) return;

    // Set up new interval
    refreshIntervalRef.current = setInterval(async () => {
      if (!isMounted.current) return;

      try {
        const result = await getNotesByUserIdAction(userId);
        if (result.success && isMounted.current) {
          // Only update state if we have notes from Redis
          // or if our optimistic note has been saved
          if (
            (result.notes && result.notes.length > 0) ||
            !optimisticNoteAdded.current
          ) {
            // Add createdAt if missing
            const notesWithCreatedAt =
              result.notes?.map((note) => {
                if (!note.createdAt) {
                  return {
                    ...note,
                    createdAt: note.updatedAt || Date.now(),
                  };
                }
                return note;
              }) || [];

            // Sort notes when refreshing
            setNotes(sortNotes(notesWithCreatedAt));

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
    }, 10000);
  }, [userId, notes, sortNotes]);

  /**
   * Temporarily pause refreshing (useful during operations like pinning)
   */
  const pauseRefreshing = useCallback(
    (durationMs = 5000) => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;

        // Restart after duration
        setTimeout(() => {
          if (isMounted.current) {
            setupRefreshInterval();
          }
        }, durationMs);
      }
    },
    [setupRefreshInterval],
  );

  /**
   * Force refresh notes from the server - useful after operations
   */
  const refreshNotes = useCallback(async () => {
    if (!userId || !isMounted.current) return;

    try {
      const result = await getNotesByUserIdAction(userId);
      if (result.success && result.notes && isMounted.current) {
        // Add createdAt if missing
        const notesWithCreatedAt = result.notes.map((note) => {
          if (!note.createdAt) {
            return {
              ...note,
              createdAt: note.updatedAt || Date.now(),
            };
          }
          return note;
        });

        setNotes(sortNotes(notesWithCreatedAt));
      }
    } catch (error) {
      console.error("Failed to refresh notes:", error);
    }
  }, [userId, sortNotes]);

  /**
   * Add a new note with optimistic UI
   */
  const addNote = useCallback(() => {
    if (animating || !userId) return;

    setAnimating(true);

    // Create new note and show it immediately (optimistic UI)
    const newNote = JSON.parse(JSON.stringify(defaultNote));
    newNote.id = generateNoteId(notes.map((note) => note.id));
    newNote.pinned = false; // New notes are not pinned by default
    newNote.isPrivate = false; // New notes are not private by default
    newNote.isCollapsed = false; // New notes are not collapsed by default
    newNote.createdAt = Date.now(); // Set creation timestamp
    newNote.updatedAt = Date.now(); // Set update timestamp
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

          // Add exponential backoff with jitter to avoid thundering herd
          const baseDelayMs = 1000 * retryCount.current;
          const jitter = Math.random() * 500; // Random jitter up to 500ms

          setTimeout(() => {
            if (isMounted.current) {
              addNoteAction(userId, newNote).catch((e) =>
                console.error(`Retry ${retryCount.current} failed:`, e),
              );
            }
          }, baseDelayMs + jitter);
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
  }, [animating, userId, notes, sortNotes]);

  /**
   * Update a note's pin status with optimistic UI
   */
  const updatePinStatus = useCallback(
    async (noteId: string, isPinned: boolean) => {
      if (!userId) return;

      // Find the existing note to preserve its properties
      const existingNote = notes.find((note) => note.id === noteId);
      if (!existingNote) return;

      // Optimistic UI update first
      const updatedNotes = notes.map((note) =>
        note.id === noteId ? { ...note, pinned: isPinned } : note,
      );

      // Apply sorting to maintain correct order
      setNotes(sortNotes(updatedNotes));

      // Pause automatic refreshes briefly to prevent flicker
      pauseRefreshing(5000);

      // Now handle the server update
      try {
        const result = await updateNotePinStatusAction(
          userId,
          noteId,
          isPinned,
        );

        if (result.success && result.notes) {
          // Use the server's note order
          setNotes(sortNotes(result.notes));
        } else {
          // If the server update failed, revert to the previous state
          refreshNotes();
        }
      } catch (error) {
        console.error("Failed to update pin status:", error);
        // Refresh from server to get the correct state
        refreshNotes();
      }
    },
    [userId, notes, sortNotes, pauseRefreshing, refreshNotes],
  );

  /**
   * Update a note's privacy status with optimistic UI
   */
  const updatePrivacyStatus = useCallback(
    async (noteId: string, isPrivate: boolean) => {
      if (!userId) return;

      // Find the existing note to preserve its properties
      const existingNote = notes.find((note) => note.id === noteId);
      if (!existingNote) return;

      // Optimistic UI update first
      const updatedNotes = notes.map((note) =>
        note.id === noteId ? { ...note, isPrivate } : note,
      );

      // Update UI immediately
      setNotes(updatedNotes);

      // Clear any existing timeout
      if (privacyTimeoutRef.current) {
        clearTimeout(privacyTimeoutRef.current);
      }

      // Now handle the server update with a slight delay to avoid too many requests
      privacyTimeoutRef.current = setTimeout(async () => {
        // Pause automatic refreshes briefly to prevent flicker
        pauseRefreshing(3000);

        try {
          const result = await updateNotePrivacyStatusAction(
            userId,
            noteId,
            isPrivate,
          );

          if (result.success && result.notes) {
            setNotes(sortNotes(result.notes));
          } else {
            // If the server update failed, revert to the previous state
            refreshNotes();
          }
        } catch (error) {
          console.error("Failed to update privacy status:", error);
          // Refresh from server to get the correct state
          refreshNotes();
        }
      }, 300); // Small delay to debounce rapid toggles
    },
    [userId, notes, sortNotes, pauseRefreshing, refreshNotes],
  );

  /**
   * Update a note's collapsed status with optimistic UI
   */
  const updateCollapsedStatus = useCallback(
    async (noteId: string, isCollapsed: boolean) => {
      if (!userId) return;

      // Find the existing note to preserve its properties
      const existingNote = notes.find((note) => note.id === noteId);
      if (!existingNote) return;

      // Optimistic UI update first
      const updatedNotes = notes.map((note) =>
        note.id === noteId ? { ...note, isCollapsed } : note,
      );

      // Update UI immediately
      setNotes(updatedNotes);

      // Clear any existing timeout
      if (collapsedTimeoutRef.current) {
        clearTimeout(collapsedTimeoutRef.current);
      }

      // Now handle the server update with a slight delay to avoid too many requests
      collapsedTimeoutRef.current = setTimeout(async () => {
        try {
          const result = await updateNoteCollapsedStatusAction(
            userId,
            noteId,
            isCollapsed,
          );

          if (result.success && result.notes) {
            // No need to update UI state here as we've already done it optimistically
            // Just keep the server's state for consistency
            setNotes(sortNotes(result.notes));
          } else {
            // If the server update failed, revert to the previous state
            refreshNotes();
          }
        } catch (error) {
          console.error("Failed to update collapsed status:", error);
          // Refresh from server to get the correct state
          refreshNotes();
        }
      }, 300); // Small delay to debounce rapid toggles
    },
    [userId, notes, sortNotes, refreshNotes],
  );

  /**
   * Reorder a note (move up/down)
   */
  const reorderNote = useCallback(
    async (noteId: string, direction: "up" | "down") => {
      if (!userId) return;

      // Pause refreshing during reordering to prevent UI jumps
      pauseRefreshing(3000);

      try {
        const result = await reorderNoteAction(userId, noteId, direction);

        if (result.success && result.notes && isMounted.current) {
          setNotes(sortNotes(result.notes));
        } else {
          // If unsuccessful, refresh from server
          refreshNotes();
        }
      } catch (error) {
        console.error("Error reordering note:", error);
        // Refresh from server to get correct order on failure
        refreshNotes();
      }
    },
    [userId, pauseRefreshing, refreshNotes, sortNotes],
  );

  /**
   * Delete a note (client-side handler)
   */
  const deleteNote = useCallback((noteId: string) => {
    // Filter out the deleted note
    setNotes((prevNotes) => prevNotes.filter((note) => note.id !== noteId));
  }, []);

  // Load notes on initial mount
  useEffect(() => {
    const loadNotes = async () => {
      try {
        const id = getUserId();
        setUserId(id);

        // First, show a default note immediately (optimistic UI)
        const optimisticNote = JSON.parse(JSON.stringify(defaultNote));
        optimisticNote.id = generateNoteId([]);
        optimisticNoteId.current = optimisticNote.id;

        // Make sure default note has privacy and collapse properties set
        optimisticNote.isPrivate = false;
        optimisticNote.isCollapsed = false;

        // Show the note immediately
        setNotes([optimisticNote]);
        setIsLoading(false);

        // Then check Redis in the background
        const result = await getNotesByUserIdAction(id);

        if (isMounted.current) {
          if (result.success && result.notes && result.notes.length > 0) {
            // Add createdAt if missing
            const notesWithCreatedAt = result.notes.map((note) => {
              if (!note.createdAt) {
                return {
                  ...note,
                  createdAt: note.updatedAt || Date.now(),
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

      // Clean up timeouts and intervals
      if (animationTimeout.current) {
        clearTimeout(animationTimeout.current);
      }

      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }

      if (privacyTimeoutRef.current) {
        clearTimeout(privacyTimeoutRef.current);
      }

      if (collapsedTimeoutRef.current) {
        clearTimeout(collapsedTimeoutRef.current);
      }
    };
  }, [sortNotes]);

  // Setup background refresh after initial load
  useEffect(() => {
    if (!userId || isInitialLoad.current) return;

    setupRefreshInterval();

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [userId, setupRefreshInterval]);

  // Return all the note functions and state variables
  return {
    // State
    notes,
    isLoading,
    animating,
    newNoteId,
    userId,

    // Functions
    addNote,
    updatePinStatus,
    updatePrivacyStatus,
    updateCollapsedStatus,
    reorderNote,
    deleteNote,
    getNotePositionInfo,
    refreshNotes,
  };
}
