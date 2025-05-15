"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Note } from "@/types/notes";
import { getUserId, generateNoteId } from "@/utils/general/notes";

import {
  // Redis actions
  addNoteAction,
  getNotesByUserIdAction,
  updateNotePinStatusAction,
  updateNotePrivacyStatusAction,
  updateNoteCollapsedStatusAction,
  reorderNoteAction,
  deleteNoteAction,
} from "@/app/actions/noteActions";
import {
  // Supabase actions
  isUserAuthenticated,
  getSupabaseNotes,
  addSupabaseNoteAction,
  updateSupabaseNotePinStatusAction,
  updateSupabaseNotePrivacyStatusAction,
  updateSupabaseNoteCollapsedStatusAction,
  deleteSupabaseNoteAction,
  reorderSupabaseNoteAction,
} from "@/utils/supabase/supabase-utils";

import { defaultNote } from "@/data/defaults/default-note";

// Define the extended Note type with storage information
interface ExtendedNote extends Note {
  storageType: "redis" | "supabase";
}

/**
 * Custom hook for managing notes with optimistic UI updates and dual storage
 * @returns {Object} Note management functions and state
 */
export function useNotes() {
  // States
  const [notes, setNotes] = useState<ExtendedNote[]>([]);
  const [redisNotes, setRedisNotes] = useState<Note[]>([]);
  const [supabaseNotes, setSupabaseNotes] = useState<Note[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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
  const sortNotes = useCallback(
    (notesToSort: ExtendedNote[]): ExtendedNote[] => {
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
    },
    [],
  );

  /**
   * Merge and sort notes from both Redis and Supabase
   */
  const mergeSortNotes = useCallback(() => {
    // First, mark each note with its source
    const taggedRedisNotes = redisNotes.map((note) => ({
      ...note,
      storageType: "redis" as const,
    }));

    const taggedSupabaseNotes = supabaseNotes.map((note) => ({
      ...note,
      storageType: "supabase" as const,
    }));

    // Merge the notes and sort them
    const mergedNotes = sortNotes([
      ...taggedRedisNotes,
      ...taggedSupabaseNotes,
    ]);

    // Update the notes state
    setNotes(mergedNotes);
  }, [redisNotes, supabaseNotes, sortNotes]);

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
        // Refresh Redis notes
        const redisResult = await getNotesByUserIdAction(userId);

        if (redisResult.success && isMounted.current) {
          // Add createdAt if missing
          const notesWithCreatedAt =
            redisResult.notes?.map((note) => {
              if (!note.createdAt) {
                return {
                  ...note,
                  createdAt: note.updatedAt || Date.now(),
                };
              }
              return note;
            }) || [];

          setRedisNotes(notesWithCreatedAt);

          // If we see our optimistic note has been saved to Redis, clear the flag
          if (
            optimisticNoteAdded.current &&
            redisResult.notes?.some(
              (note) => note.id === optimisticNoteId.current,
            )
          ) {
            optimisticNoteAdded.current = false;
            retryCount.current = 0; // Reset retry count once note is confirmed saved
          }
        }

        // If authenticated, also refresh Supabase notes
        if (isAuthenticated && authUserId) {
          const supabaseResult = await getSupabaseNotes(authUserId);

          if (
            supabaseResult.success &&
            isMounted.current &&
            supabaseResult.notes
          ) {
            setSupabaseNotes(supabaseResult.notes);
          }
        }

        // Merge and sort notes
        mergeSortNotes();
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

            // Try to save based on authentication status
            if (isAuthenticated && authUserId) {
              addSupabaseNoteAction(authUserId, optimisticNote).catch((e) =>
                console.error(`Refresh retry ${retryCount.current} failed:`, e),
              );
            } else {
              addNoteAction(userId, optimisticNote).catch((e) =>
                console.error(`Refresh retry ${retryCount.current} failed:`, e),
              );
            }
          }
        }
      }
    }, 10000);
  }, [userId, authUserId, isAuthenticated, notes, sortNotes, mergeSortNotes]);

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
   * Force refresh notes from the server
   */
  const refreshNotes = useCallback(async () => {
    if (!userId || !isMounted.current) return;

    try {
      // Refresh Redis notes
      const redisResult = await getNotesByUserIdAction(userId);

      if (redisResult.success && redisResult.notes && isMounted.current) {
        // Add createdAt if missing
        const notesWithCreatedAt = redisResult.notes.map((note) => {
          if (!note.createdAt) {
            return {
              ...note,
              createdAt: note.updatedAt || Date.now(),
            };
          }
          return note;
        });

        setRedisNotes(notesWithCreatedAt);
      }

      // If authenticated, also refresh Supabase notes
      if (isAuthenticated && authUserId) {
        const supabaseResult = await getSupabaseNotes(authUserId);

        if (
          supabaseResult.success &&
          supabaseResult.notes &&
          isMounted.current
        ) {
          setSupabaseNotes(supabaseResult.notes);
        }
      }

      // Merge and sort notes
      mergeSortNotes();
    } catch (error) {
      console.error("Failed to refresh notes:", error);
    }
  }, [userId, authUserId, isAuthenticated, mergeSortNotes]);

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

    // Add storageType property - if authenticated, save to Supabase, otherwise Redis
    const storageType = isAuthenticated && authUserId ? "supabase" : "redis";
    const noteWithStorageType = { ...newNote, storageType };

    // Get pinned and unpinned notes
    const pinnedNotes = notes.filter((note) => note.pinned);
    const unpinnedNotes = notes.filter((note) => !note.pinned);

    // Add the new note at the top of unpinned notes
    const updatedNotes = [
      ...pinnedNotes,
      noteWithStorageType,
      ...unpinnedNotes,
    ];
    setNotes(updatedNotes);

    // Save note in background, don't block UI
    if (isAuthenticated && authUserId) {
      // Save to Supabase if authenticated
      addSupabaseNoteAction(authUserId, newNote)
        .then((result) => {
          if (result.success && result.notes && isMounted.current) {
            setSupabaseNotes(result.notes);
            mergeSortNotes();
          }
        })
        .catch((error) => {
          console.error("Failed to add note to Supabase:", error);
          // Set up retry for transient errors
          if (retryCount.current < MAX_RETRIES) {
            retryCount.current++;
            setTimeout(
              () => {
                if (isMounted.current) {
                  addSupabaseNoteAction(authUserId!, newNote).catch((e) =>
                    console.error(`Retry ${retryCount.current} failed:`, e),
                  );
                }
              },
              1000 * retryCount.current + Math.random() * 500,
            ); // Exponential backoff with jitter
          }
        });
    } else {
      // Save to Redis if not authenticated
      addNoteAction(userId, newNote)
        .then((result) => {
          if (result.success && result.notes && isMounted.current) {
            setRedisNotes(result.notes);
            mergeSortNotes();
          }
        })
        .catch((error) => {
          console.error("Failed to add note to Redis:", error);
          // Set up retry for transient errors
          if (retryCount.current < MAX_RETRIES) {
            retryCount.current++;
            setTimeout(
              () => {
                if (isMounted.current) {
                  addNoteAction(userId, newNote).catch((e) =>
                    console.error(`Retry ${retryCount.current} failed:`, e),
                  );
                }
              },
              1000 * retryCount.current + Math.random() * 500,
            ); // Exponential backoff with jitter
          }
        });
    }

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
  }, [animating, userId, authUserId, isAuthenticated, notes, mergeSortNotes]);

  /**
   * Update a note's pin status
   */
  const updatePinStatus = useCallback(
    async (noteId: string, isPinned: boolean) => {
      if (!userId) return;

      // Find the note to update
      const noteToUpdate = notes.find((note) => note.id === noteId);
      if (!noteToUpdate) return;

      // Get the storage type from the note
      const storageType = noteToUpdate.storageType;

      // Optimistic UI update first
      const updatedNotes = notes.map((note) =>
        note.id === noteId ? { ...note, pinned: isPinned } : note,
      );

      // Apply sorting to maintain correct order
      setNotes(sortNotes(updatedNotes));

      // Pause automatic refreshes briefly to prevent flicker
      pauseRefreshing(5000);

      try {
        if (storageType === "supabase" && authUserId) {
          // Update in Supabase
          const result = await updateSupabaseNotePinStatusAction(
            authUserId,
            noteId,
            isPinned,
          );

          if (result.success && result.notes) {
            setSupabaseNotes(result.notes);
            mergeSortNotes();
          } else {
            refreshNotes();
          }
        } else {
          // Update in Redis
          const result = await updateNotePinStatusAction(
            userId,
            noteId,
            isPinned,
          );

          if (result.success && result.notes) {
            setRedisNotes(result.notes);
            mergeSortNotes();
          } else {
            refreshNotes();
          }
        }
      } catch (error) {
        console.error("Failed to update pin status:", error);
        refreshNotes();
      }
    },
    [
      userId,
      authUserId,
      notes,
      sortNotes,
      pauseRefreshing,
      refreshNotes,
      mergeSortNotes,
    ],
  );

  /**
   * Update a note's privacy status
   */
  const updatePrivacyStatus = useCallback(
    async (noteId: string, isPrivate: boolean) => {
      if (!userId) return;

      // Find the note to update
      const noteToUpdate = notes.find((note) => note.id === noteId);
      if (!noteToUpdate) return;

      // Get the storage type from the note
      const storageType = noteToUpdate.storageType;

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
        try {
          if (storageType === "supabase" && authUserId) {
            // Update in Supabase
            const result = await updateSupabaseNotePrivacyStatusAction(
              authUserId,
              noteId,
              isPrivate,
            );

            if (result.success && result.notes) {
              setSupabaseNotes(result.notes);
              mergeSortNotes();
            } else {
              refreshNotes();
            }
          } else {
            // Update in Redis
            const result = await updateNotePrivacyStatusAction(
              userId,
              noteId,
              isPrivate,
            );

            if (result.success && result.notes) {
              setRedisNotes(result.notes);
              mergeSortNotes();
            } else {
              refreshNotes();
            }
          }
        } catch (error) {
          console.error("Failed to update privacy status:", error);
          refreshNotes();
        }
      }, 300); // Small delay to debounce rapid toggles
    },
    [userId, authUserId, notes, refreshNotes, mergeSortNotes],
  );

  /**
   * Update a note's collapsed status
   */
  const updateCollapsedStatus = useCallback(
    async (noteId: string, isCollapsed: boolean) => {
      if (!userId) return;

      // Find the note to update
      const noteToUpdate = notes.find((note) => note.id === noteId);
      if (!noteToUpdate) return;

      // Get the storage type from the note
      const storageType = noteToUpdate.storageType;

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
          if (storageType === "supabase" && authUserId) {
            // Update in Supabase
            const result = await updateSupabaseNoteCollapsedStatusAction(
              authUserId,
              noteId,
              isCollapsed,
            );

            if (result.success && result.notes) {
              setSupabaseNotes(result.notes);
              mergeSortNotes();
            } else {
              refreshNotes();
            }
          } else {
            // Update in Redis
            const result = await updateNoteCollapsedStatusAction(
              userId,
              noteId,
              isCollapsed,
            );

            if (result.success && result.notes) {
              setRedisNotes(result.notes);
              mergeSortNotes();
            } else {
              refreshNotes();
            }
          }
        } catch (error) {
          console.error("Failed to update collapsed status:", error);
          refreshNotes();
        }
      }, 300); // Small delay to debounce rapid toggles
    },
    [userId, authUserId, notes, refreshNotes, mergeSortNotes],
  );

  /**
   * Reorder a note
   */
  const reorderNote = useCallback(
    async (noteId: string, direction: "up" | "down") => {
      if (!userId) return;

      // Find the note to update
      const noteToUpdate = notes.find((note) => note.id === noteId);
      if (!noteToUpdate) return;

      // Get the storage type from the note
      const storageType = noteToUpdate.storageType;

      // Pause refreshing during reordering to prevent UI jumps
      pauseRefreshing(3000);

      try {
        if (storageType === "supabase" && authUserId) {
          // Reorder in Supabase
          const result = await reorderSupabaseNoteAction(
            authUserId,
            noteId,
            direction,
          );

          if (result.success && result.notes && isMounted.current) {
            setSupabaseNotes(result.notes);
            mergeSortNotes();
          } else {
            refreshNotes();
          }
        } else {
          // Reorder in Redis
          const result = await reorderNoteAction(userId, noteId, direction);

          if (result.success && result.notes && isMounted.current) {
            setRedisNotes(result.notes);
            mergeSortNotes();
          } else {
            refreshNotes();
          }
        }
      } catch (error) {
        console.error("Error reordering note:", error);
        refreshNotes();
      }
    },
    [userId, authUserId, notes, pauseRefreshing, refreshNotes, mergeSortNotes],
  );

  /**
   * Delete a note
   */
  const deleteNote = useCallback(
    async (noteId: string) => {
      // Find the note to delete
      const noteToDelete = notes.find((note) => note.id === noteId);
      if (!noteToDelete) return;

      // Get the storage type from the note
      const storageType = noteToDelete.storageType;

      // Optimistic UI update - remove from local state immediately
      setNotes((prevNotes) => prevNotes.filter((note) => note.id !== noteId));

      try {
        if (storageType === "supabase" && authUserId) {
          // Delete from Supabase
          await deleteSupabaseNoteAction(authUserId, noteId);
          setSupabaseNotes((prev) => prev.filter((note) => note.id !== noteId));
        } else {
          // Delete from Redis
          await deleteNoteAction(userId!, noteId);
          setRedisNotes((prev) => prev.filter((note) => note.id !== noteId));
        }
      } catch (error) {
        console.error("Error deleting note:", error);
        // If deletion fails, refresh to restore the correct state
        refreshNotes();
      }
    },
    [userId, authUserId, notes, refreshNotes],
  );

  /**
   * Handle note transfer from Redis to Supabase
   */
  const handleNoteTransfer = useCallback(
    (noteId: string) => {
      // After a note is transferred, update our local state
      // The transfer function itself will handle the server-side work
      refreshNotes();
    },
    [refreshNotes],
  );

  // Check authentication status on load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const auth = await isUserAuthenticated();
        setIsAuthenticated(auth.isAuthenticated);
        setAuthUserId(auth.userId);
      } catch (error) {
        console.error("Error checking authentication status:", error);
        setIsAuthenticated(false);
        setAuthUserId(null);
      }
    };

    checkAuth();
  }, []);

  // Load notes on initial mount
  useEffect(() => {
    const loadNotes = async () => {
      try {
        const id = getUserId();
        setUserId(id);

        // First, check authentication status
        const auth = await isUserAuthenticated();
        setIsAuthenticated(auth.isAuthenticated);
        setAuthUserId(auth.userId);

        setIsLoading(true);

        // Load Redis notes for anonymous user ID
        const redisResult = await getNotesByUserIdAction(id);

        if (redisResult.success && redisResult.notes) {
          // Add createdAt if missing
          const notesWithCreatedAt = redisResult.notes.map((note) => {
            if (!note.createdAt) {
              return {
                ...note,
                createdAt: note.updatedAt || Date.now(),
              };
            }
            return note;
          });

          setRedisNotes(notesWithCreatedAt);
        }

        // If authenticated, also load Supabase notes
        if (auth.isAuthenticated && auth.userId) {
          const supabaseResult = await getSupabaseNotes(auth.userId);

          if (supabaseResult.success && supabaseResult.notes) {
            setSupabaseNotes(supabaseResult.notes);
          }
        }

        // Merge and sort notes
        const taggedRedisNotes =
          redisResult.success && redisResult.notes
            ? redisResult.notes.map((note) => ({
                ...note,
                storageType: "redis" as const,
              }))
            : [];

        const taggedSupabaseNotes =
          auth.isAuthenticated && auth.userId
            ? ((await getSupabaseNotes(auth.userId)).notes || []).map(
                (note) => ({
                  ...note,
                  storageType: "supabase" as const,
                }),
              )
            : [];

        // Sort all notes
        const allNotes = sortNotes([
          ...taggedRedisNotes,
          ...taggedSupabaseNotes,
        ]);
        setNotes(allNotes);

        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load notes:", error);

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
    authUserId,
    isAuthenticated,

    // Functions
    addNote,
    updatePinStatus,
    updatePrivacyStatus,
    updateCollapsedStatus,
    reorderNote,
    deleteNote,
    handleNoteTransfer,
    getNotePositionInfo,
    refreshNotes,
  };
}
