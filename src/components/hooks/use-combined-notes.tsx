"use client";

import { useState, useEffect, useRef, useCallback } from "react";

import { Tables } from "../../../database.types";
import { CombinedNote, NoteSource } from "@/types/combined-notes";
import { getUserId, generateNoteId } from "@/utils/general/notes";

type SupabaseNote = Tables<`notes`>;
type RedisNote = {
  id: string;
  author?: string;
  title: string;
  content: string;
  pinned?: boolean;
  isPrivate?: boolean;
  isCollapsed?: boolean;
  order?: number;
  createdAt?: number;
  updatedAt?: number;
};

import {
  addNoteAction,
  getNotesByUserIdAction,
  updateNotePinStatusAction,
  updateNotePrivacyStatusAction,
  updateNoteCollapsedStatusAction,
  deleteNoteAction,
  updateNoteOrderAction,
} from "@/app/actions/redisActions";

import {
  createNote as createSupabaseNote,
  getNotesByUserId as getSupabaseNotesByUserId,
  updateNotePinStatus as updateSupabaseNotePinStatus,
  updateNotePrivacyStatus as updateSupabaseNotePrivacyStatus,
  updateNoteCollapsedStatus as updateSupabaseNoteCollapsedStatus,
  deleteNote as deleteSupabaseNote,
  updateSupabaseNoteOrder,
} from "@/app/actions/supabaseActions";

import { defaultNote } from "@/data/defaults/default-note";
import { createClient } from "@/utils/supabase/client";
import { incrementGlobalNoteCount } from "@/app/actions/counterActions";

/**
 * Custom hook for managing both Redis and Supabase notes with optimistic UI updates
 */
export function useCombinedNotes() {
  // States
  const [notes, setNotes] = useState<CombinedNote[]>([]);
  const [redisUserId, setRedisUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [newNoteId, setNewNoteId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReorderingInProgress, setIsReorderingInProgress] = useState(false);
  const [lastUpdateTimestamp, setLastUpdateTimestamp] = useState<number>(
    Date.now(),
  );

  const [creationError, setCreationError] = useState(false);
  const [transferError, setTransferError] = useState(false);
  const [transferringNoteId, setTransferringNoteId] = useState<string | null>(
    null,
  );

  // Use Supabase auth to determine if user is authenticated
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);

  // Refs
  const animationTimeout = useRef<NodeJS.Timeout | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);
  const isInitialLoad = useRef(true);

  /**
   * Mark an update happened to track activity
   */
  const markUpdated = useCallback(() => {
    setLastUpdateTimestamp(Date.now());
  }, []);

  /**
   * Sort notes based on pin status, order, and creation date
   */
  const sortNotes = useCallback(
    (notesToSort: CombinedNote[]): CombinedNote[] => {
      return [...notesToSort].sort((a, b) => {
        // First sort by pin status (pinned notes first)
        if ((a.isPinned ?? false) && !(b.isPinned ?? false)) return -1;
        if (!(a.isPinned ?? false) && (b.isPinned ?? false)) return 1;

        // Within same pin status, sort by order number
        return (a.order ?? 0) - (b.order ?? 0);
      });
    },
    [],
  );

  const ensureOrderNumbers = useCallback(
    (notesToProcess: CombinedNote[]): CombinedNote[] => {
      // First separate by pin status - with null coalescing for safety
      const pinnedNotes = notesToProcess.filter(
        (note) => note.isPinned ?? false,
      );
      const unpinnedNotes = notesToProcess.filter(
        (note) => !(note.isPinned ?? false),
      );

      // For each group, ensure every note has an order number
      // If not assigned, assign sequential order numbers

      // Start with pinned notes
      let currentOrder = 1;
      const orderedPinnedNotes = pinnedNotes.map((note) => {
        if (note.order === undefined || note.order === null) {
          return { ...note, order: currentOrder++ };
        }
        return note;
      });

      // Continue with unpinned notes (sequence continues from pinned)
      const orderedUnpinnedNotes = unpinnedNotes.map((note) => {
        if (note.order === undefined || note.order === null) {
          return { ...note, order: currentOrder++ };
        }
        return note;
      });

      // Combine both groups and return
      return [...orderedPinnedNotes, ...orderedUnpinnedNotes];
    },
    [],
  );

  /**
   * Renumber all notes to have consistent order, starting from 1
   */
  const renumberNotes = useCallback(
    (notesToRenumber: CombinedNote[]): CombinedNote[] => {
      // Sort notes first to ensure correct ordering
      const sortedNotes = sortNotes(notesToRenumber);

      // Get pinned and unpinned notes
      const pinnedNotes = sortedNotes.filter((note) => note.isPinned);
      const unpinnedNotes = sortedNotes.filter((note) => !note.isPinned);

      // Renumber pinned notes first, starting from 1
      const renumberedPinned = pinnedNotes.map((note, index) => ({
        ...note,
        order: index + 1,
      }));

      // Then renumber unpinned notes, continuing the sequence
      const renumberedUnpinned = unpinnedNotes.map((note, index) => ({
        ...note,
        order: pinnedNotes.length + index + 1,
      }));

      // Combine both arrays
      return [...renumberedPinned, ...renumberedUnpinned];
    },
    [sortNotes],
  );

  /**
   * Centralized error handler for operations
   */
  const handleOperationError = useCallback((operation: string, error: any) => {
    console.error(`Failed to ${operation}:`, error);

    // Set user-visible error state based on operation type
    if (operation.includes("create")) {
      setCreationError(true);
      // Clear after a while
      setTimeout(() => setCreationError(false), 3000);
    } else if (operation.includes("transfer")) {
      setTransferError(true);
      setTimeout(() => setTransferError(false), 3000);
    }

    // Always refresh to ensure consistent state
    refreshNotes();
  }, []);

  /**
   * Convert a Note to a CombinedNote with source information
   */
  const convertToRedisNote = useCallback(
    (note: CombinedNote): RedisNote => {
      return {
        id: note.id,
        author: note.author || redisUserId || "",
        title: note.title || "",
        content: note.content || "",
        pinned: note.isPinned,
        isPrivate: note.isPrivate,
        isCollapsed: note.isCollapsed,
        order: note.order,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      };
    },
    [redisUserId],
  );

  /**
   * Convert CombinedNote back to appropriate format for Redis or Supabase
   */
  const convertToSupabaseNote = useCallback(
    (note: CombinedNote): Partial<SupabaseNote> => {
      return {
        id: note.id,
        author: user?.id || note.author || null,
        title: note.title || null,
        content: note.content || null,
        is_pinned: note.isPinned === undefined ? null : note.isPinned,
        is_private: note.isPrivate === undefined ? null : note.isPrivate,
        is_collapsed: note.isCollapsed === undefined ? null : note.isCollapsed,
        order: note.order === undefined ? null : note.order,
        created_at: new Date(note.createdAt).toISOString(),
        updated_at: new Date(note.updatedAt).toISOString(),
        goal: note.goal || 0,
        goal_type: note.goal_type || "",
      };
    },
    [user?.id],
  );

  /**
   * Convert Redis note to a CombinedNote
   */
  const convertRedisToCombined = useCallback(
    (note: RedisNote): CombinedNote => {
      return {
        id: note.id,
        author: note.author || "",
        title: note.title || "",
        content: note.content || "",
        isPinned: note.pinned || false,
        isPrivate: note.isPrivate || false,
        isCollapsed: note.isCollapsed || false,
        createdAt: note.createdAt || Date.now(),
        updatedAt: note.updatedAt || Date.now(),
        order: note.order || 0,
        source: "redis",
      };
    },
    [],
  );

  /**
   * Convert Supabase note to a CombinedNote
   */
  const convertSupabaseToCombined = useCallback(
    (note: SupabaseNote): CombinedNote => {
      return {
        id: note.id,
        author: note.author || "",
        title: note.title || "",
        content: note.content || "",
        isPinned: note.is_pinned === null ? false : note.is_pinned,
        isPrivate: note.is_private === null ? false : note.is_private,
        isCollapsed: note.is_collapsed === null ? false : note.is_collapsed,
        createdAt: note.created_at
          ? new Date(note.created_at).getTime()
          : Date.now(),
        updatedAt: note.updated_at
          ? new Date(note.updated_at).getTime()
          : Date.now(),
        order: note.order === null ? 0 : note.order,
        source: "supabase",
        goal: note.goal || 0,
        goal_type: note.goal_type || "",
      };
    },
    [],
  );

  /**
   * Convert note based on source type
   */
  const convertToCombinedNote = useCallback(
    (note: any, source: NoteSource): CombinedNote => {
      if (source === "redis") {
        return convertRedisToCombined(note);
      } else {
        return convertSupabaseToCombined(note);
      }
    },
    [convertRedisToCombined, convertSupabaseToCombined],
  );

  /**
   * Convert CombinedNote back to appropriate format
   */
  const convertFromCombinedNote = useCallback(
    (note: CombinedNote, target: NoteSource): any => {
      if (target === "redis") {
        return convertToRedisNote(note);
      } else {
        return convertToSupabaseNote(note);
      }
    },
    [convertToRedisNote, convertToSupabaseNote],
  );

  /**
   * Orders notes in a combined array and handles both Redis and Supabase notes
   * The 'order' value represents the note's absolute position regardless of pinned status
   */
  const normalizeNotesOrdering = useCallback(
    (allNotes: CombinedNote[]): CombinedNote[] => {
      // First, sort notes by existing order (if available) and creation date
      // This gets them in the right sequence without considering pin status
      const presortedNotes = [...allNotes].sort((a, b) => {
        // Both have order numbers - use them
        if (
          a.order !== undefined &&
          a.order !== null &&
          b.order !== undefined &&
          b.order !== null
        ) {
          return a.order - b.order;
        }

        // One has order - prioritize the one with order
        if (a.order !== undefined && a.order !== null) return -1;
        if (b.order !== undefined && b.order !== null) return 1;

        // Neither has order - sort by creation date (oldest first)
        const aTime = a.createdAt ?? 0;
        const bTime = b.createdAt ?? 0;
        return aTime - bTime; // Oldest first (for natural ordering)
      });

      // Now assign sequential order numbers from 1 to N
      const orderedNotes = presortedNotes.map((note, index) => ({
        ...note,
        order: index + 1, // Order starts at 1
      }));

      // Finally, sort for display (pinned first, then by order)
      return orderedNotes.sort((a, b) => {
        // Sort by pin status first (pinned notes first)
        if ((a.isPinned ?? false) && !(b.isPinned ?? false)) return -1;
        if (!(a.isPinned ?? false) && (b.isPinned ?? false)) return 1;

        // Then by order number
        return (a.order ?? 0) - (b.order ?? 0);
      });
    },
    [],
  );

  /**
   * Force refresh notes from both Redis and Supabase
   */
  const refreshNotes = useCallback(async () => {
    if (!redisUserId || !isMounted.current) return;

    try {
      // Get Redis notes using the local redisUserId
      const redisResult = await getNotesByUserIdAction(redisUserId);
      let redisNotes: CombinedNote[] = [];
      if (redisResult.success && redisResult.notes) {
        redisNotes = redisResult.notes.map((note) =>
          convertToCombinedNote(note, "redis"),
        );
      }

      // Get Supabase notes if authenticated using the auth user ID
      let supabaseNotes: CombinedNote[] = [];
      if (isAuthenticated && user?.id) {
        // Check for user.id
        const supabaseResult = await getSupabaseNotesByUserId(user.id); // Use user.id
        if (supabaseResult.success && supabaseResult.notes) {
          supabaseNotes = supabaseResult.notes.map((note) =>
            convertToCombinedNote(note, "supabase"),
          );
        }
      }

      // Combine notes from both sources
      const combinedNotes = [...redisNotes, ...supabaseNotes];

      // Normalize ordering (assign sequential order numbers and sort properly)
      const normalizedNotes = normalizeNotesOrdering(combinedNotes);

      if (isMounted.current) {
        // Set notes with normalized ordering
        setNotes(normalizedNotes);

        // If we've assigned any new order numbers, save them to the backends
        const notesWithNewOrders = normalizedNotes.filter((normalizedNote) => {
          // Find the original note
          const originalNote = combinedNotes.find(
            (n) => n.id === normalizedNote.id,
          );
          // Check if the order has changed
          return originalNote && originalNote.order !== normalizedNote.order;
        });

        // Update the backends with the new order numbers (in background)
        if (notesWithNewOrders.length > 0) {
          // Save in background - don't await
          saveUpdatedOrders(notesWithNewOrders);
        }
      }

      // Mark that we've refreshed
      markUpdated();
    } catch (error) {
      console.error("Failed to refresh notes:", error);
    }
  }, [
    redisUserId,
    isAuthenticated,
    user?.id,
    convertToCombinedNote,
    normalizeNotesOrdering,
    markUpdated,
  ]);

  /**
   * Helper function to save updated orders to backends
   */
  const saveUpdatedOrders = useCallback(
    async (notesWithNewOrders: CombinedNote[]) => {
      const updatePromises = [];

      for (const note of notesWithNewOrders) {
        if (note.source === "redis") {
          updatePromises.push(
            updateNoteOrderAction(
              redisUserId as string,
              note.id,
              note.order as number,
            ),
          );
        } else if (user?.id) {
          updatePromises.push(
            updateSupabaseNoteOrder(user.id, note.id, note.order as number),
          );
        }
      }

      try {
        await Promise.all(updatePromises);
        console.log("Successfully updated order numbers in backends");
      } catch (error) {
        console.error("Failed to update order numbers:", error);
      }
    },
    [redisUserId, user?.id],
  );

  /**
   * Update a single note in state with optimized rendering
   */
  const updateNoteInState = useCallback(
    (noteId: string, updates: Partial<CombinedNote>) => {
      setNotes((prevNotes) => {
        // Only create a new array if we're actually updating something
        const noteIndex = prevNotes.findIndex((note) => note.id === noteId);
        if (noteIndex === -1) return prevNotes;

        // Create a new array with the updated note
        const newNotes = [...prevNotes];
        newNotes[noteIndex] = { ...newNotes[noteIndex], ...updates };

        // Only sort if the update affects sorting (pin status or order)
        if ("isPinned" in updates || "order" in updates) {
          return sortNotes(newNotes);
        }
        return newNotes;
      });
    },
    [sortNotes],
  );

  /**
   * Sync all notes with backend and normalize order numbers
   * Uses absolute ordering regardless of pinned status
   */
  const syncAndRenumberNotes = useCallback(async () => {
    if (!redisUserId) return;
    setIsReorderingInProgress(true);

    try {
      // First, sort notes by their natural order (ignoring pin status)
      // This gets them in sequence by existing order, then by creation date
      const naturalOrderedNotes = [...notes].sort((a, b) => {
        // If both have order, use it
        if (
          a.order !== undefined &&
          a.order !== null &&
          b.order !== undefined &&
          b.order !== null
        ) {
          return a.order - b.order;
        }

        // One has order - prioritize that one
        if (a.order !== undefined && a.order !== null) return -1;
        if (b.order !== undefined && b.order !== null) return 1;

        // Neither has order - sort by creation date (oldest first)
        const aTime = a.createdAt ?? 0;
        const bTime = b.createdAt ?? 0;
        return aTime - bTime;
      });

      // Assign sequential order numbers from 1 onwards
      const renumberedNotes = naturalOrderedNotes.map((note, index) => ({
        ...note,
        order: index + 1, // Start at 1
      }));

      // Apply to state (this will sort by pin status first, then order)
      setNotes(sortNotes(renumberedNotes));

      // Split notes by source for backend updates
      const redisNotes = renumberedNotes.filter(
        (note) => note.source === "redis",
      );
      const supabaseNotes = renumberedNotes.filter(
        (note) => note.source === "supabase",
      );

      // Prepare batch update data
      const redisOrderUpdates = redisNotes.map((note) => ({
        id: note.id,
        order: note.order as number,
      }));

      const supabaseOrderUpdates = supabaseNotes.map((note) => ({
        id: note.id,
        order: note.order as number,
      }));

      // Execute batch updates
      const updatePromises = [];

      // Redis updates
      if (redisOrderUpdates.length > 0) {
        for (const update of redisOrderUpdates) {
          updatePromises.push(
            updateNoteOrderAction(redisUserId, update.id, update.order),
          );
        }
      }

      // Supabase updates if authenticated
      if (isAuthenticated && user?.id && supabaseOrderUpdates.length > 0) {
        for (const update of supabaseOrderUpdates) {
          updatePromises.push(
            updateSupabaseNoteOrder(user.id, update.id, update.order),
          );
        }
      }

      // Wait for all updates to complete
      await Promise.allSettled(updatePromises);

      // Refresh notes from both sources
      await refreshNotes();

      // Mark that we've updated the state
      markUpdated();
    } catch (error) {
      console.error("Error syncing and renumbering notes:", error);
    } finally {
      setIsReorderingInProgress(false);
    }
  }, [
    redisUserId,
    notes,
    sortNotes,
    isAuthenticated,
    user?.id,
    refreshNotes,
    markUpdated,
  ]);

  /**
   * Get position info for a note (first/last in its category)
   */
  const getNotePositionInfo = useCallback(
    (noteId: string, pinStatus: boolean) => {
      // Get all pinned and unpinned notes
      const pinnedNotes = notes.filter((note) => note.isPinned);
      const unpinnedNotes = notes.filter((note) => !note.isPinned);

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
   * Helper function to save a note to the appropriate storage
   */
  const saveToStorage = useCallback(
    async (note: CombinedNote) => {
      if (note.source === "redis") {
        return addNoteAction(
          redisUserId as string,
          convertFromCombinedNote(note, "redis"),
        );
      } else if (note.source === "supabase" && user?.id) {
        const supabaseNote = convertFromCombinedNote(note, "supabase");
        supabaseNote.author = user.id; // Ensure correct author
        return createSupabaseNote(supabaseNote);
      }
      throw new Error(`Cannot save to ${note.source} storage`);
    },
    [redisUserId, user?.id, convertFromCombinedNote],
  );

  /**
   * Add a new note
   */
  const addNote = useCallback(() => {
    if (animating || !redisUserId) {
      console.log("Early return due to:", { animating, redisUserId });
      return;
    }

    console.log("ADD NOTE - Auth status:", {
      isAuthenticated,
      redisUserId,
      user: user?.id,
      timestamp: new Date().toISOString(),
    });

    setAnimating(true);

    // Determine where to save the note based on authentication status
    const noteSource: NoteSource = isAuthenticated ? "supabase" : "redis";

    // Get the next note number from Redis regardless of storage location
    incrementGlobalNoteCount().then((noteNumber) => {
      // Create new note
      const newNote = JSON.parse(JSON.stringify(defaultNote));
      newNote.id = generateNoteId(notes.map((note) => note.id));
      newNote.title = `Just Noted #${noteNumber}`;
      newNote.isPinned = false;
      newNote.isPrivate = false;
      newNote.isCollapsed = false;
      newNote.createdAt = Date.now();
      newNote.updatedAt = Date.now();
      newNote.source = noteSource;

      // Calculate a new order number for the top position (just after pinned notes)
      // First, get all current pinned notes
      const pinnedNotes = notes.filter((note) => note.isPinned ?? false);

      // Shift all existing unpinned notes down by 1 to make room at the top
      const updatedNotes = notes.map((note) => {
        // Only increment unpinned notes' order
        if (
          !(note.isPinned ?? false) &&
          note.order !== undefined &&
          note.order !== null
        ) {
          return { ...note, order: note.order + 1 };
        }
        return note;
      });

      // Assign the new note an order number that puts it at the top of unpinned notes
      // If we have pinned notes, put it right after the last one
      // If no pinned notes, give it order 1
      newNote.order =
        pinnedNotes.length > 0
          ? Math.max(...pinnedNotes.map((note) => note.order ?? 0)) + 1
          : 1;

      // Update local state first (optimistic UI)
      setNewNoteId(newNote.id);
      setNotes(sortNotes([...updatedNotes, newNote]));

      // Save the note to the appropriate storage
      saveToStorage(newNote)
        .then((result) => {
          console.log(`${noteSource} save result:`, result);
          setAnimating(false);

          if (result.success) {
            // After adding the note, update all other notes' order numbers in the background
            updateAllNoteOrders(updatedNotes);

            // Mark that we've updated state
            markUpdated();

            if (noteSource === "supabase") {
              refreshNotes(); // Refresh to get the server-generated IDs
            }
          }
        })
        .catch((error) => {
          handleOperationError("create note", error);
          setAnimating(false);
          setCreationError(true);

          // Auto-clear error after delay
          setTimeout(() => setCreationError(false), 3000);
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
    });
  }, [
    animating,
    redisUserId,
    notes,
    isAuthenticated,
    user?.id,
    sortNotes,
    saveToStorage,
    refreshNotes,
    markUpdated,
    handleOperationError,
  ]);

  /**
   * Helper function to update order numbers for all notes in a batch
   */
  const updateAllNoteOrders = useCallback(
    async (notesToUpdate: CombinedNote[]) => {
      try {
        // Group updates by source
        const redisUpdates: { id: string; order: number }[] = [];
        const supabaseUpdates: { id: string; order: number }[] = [];

        notesToUpdate.forEach((note) => {
          // Skip notes without valid order
          if (note.order === undefined || note.order === null) return;

          if (note.source === "redis") {
            redisUpdates.push({ id: note.id, order: note.order });
          } else {
            supabaseUpdates.push({ id: note.id, order: note.order });
          }
        });

        // Prepare update promises
        const updatePromises = [];

        // Update Redis notes
        for (const update of redisUpdates) {
          updatePromises.push(
            updateNoteOrderAction(
              redisUserId as string,
              update.id,
              update.order,
            ),
          );
        }

        // Update Supabase notes
        if (user?.id) {
          for (const update of supabaseUpdates) {
            updatePromises.push(
              updateSupabaseNoteOrder(user.id, update.id, update.order),
            );
          }
        }

        // Execute all updates in parallel
        await Promise.allSettled(updatePromises);

        // Mark that we've updated the notes
        markUpdated();
      } catch (error) {
        console.error("Failed to update all note orders:", error);
      }
    },
    [redisUserId, user?.id, markUpdated],
  );

  /**
   * Update a note's pin status
   */
  const updatePinStatus = useCallback(
    async (noteId: string, isPinned: boolean) => {
      if (!redisUserId) return;

      // Find the note to be updated
      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      // Optimistic UI update
      updateNoteInState(noteId, { isPinned });

      try {
        // Update in the appropriate backend
        if (targetNote.source === "redis") {
          await updateNotePinStatusAction(redisUserId, noteId, isPinned);
        } else if (user?.id) {
          await updateSupabaseNotePinStatus(user.id, noteId, isPinned);
        }

        // Refresh notes to ensure correct order
        await refreshNotes();

        // Mark that we've updated the state
        markUpdated();
      } catch (error) {
        handleOperationError("update pin status", error);
      }
    },
    [
      redisUserId,
      notes,
      user?.id,
      updateNoteInState,
      refreshNotes,
      markUpdated,
      handleOperationError,
    ],
  );

  /**
   * Update a note's privacy status
   */
  const updatePrivacyStatus = useCallback(
    async (noteId: string, isPrivate: boolean) => {
      if (!redisUserId) return;

      // Find the note to be updated
      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      // Optimistic UI update
      updateNoteInState(noteId, { isPrivate });

      try {
        // Update in the appropriate backend
        if (targetNote.source === "redis") {
          await updateNotePrivacyStatusAction(redisUserId, noteId, isPrivate);
        } else if (user?.id) {
          await updateSupabaseNotePrivacyStatus(user.id, noteId, isPrivate);
        }

        // Mark that we've updated the state
        markUpdated();
      } catch (error) {
        handleOperationError("update privacy status", error);
      }
    },
    [
      redisUserId,
      notes,
      user?.id,
      updateNoteInState,
      markUpdated,
      handleOperationError,
    ],
  );

  /**
   * Update a note's collapsed status
   */
  const updateCollapsedStatus = useCallback(
    async (noteId: string, isCollapsed: boolean) => {
      if (!redisUserId) return;

      // Find the note to be updated
      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      // Optimistic UI update
      updateNoteInState(noteId, { isCollapsed });

      try {
        // Update in the appropriate backend
        if (targetNote.source === "redis") {
          await updateNoteCollapsedStatusAction(
            redisUserId,
            noteId,
            isCollapsed,
          );
        } else if (user?.id) {
          await updateSupabaseNoteCollapsedStatus(user.id, noteId, isCollapsed);
        }

        // Mark that we've updated the state
        markUpdated();
      } catch (error) {
        handleOperationError("update collapsed status", error);
      }
    },
    [
      redisUserId,
      notes,
      user?.id,
      updateNoteInState,
      markUpdated,
      handleOperationError,
    ],
  );

  /**
   * Reorder a note (move up/down) using a batch approach for better reliability
   */
  const reorderNote = useCallback(
    async (noteId: string, direction: "up" | "down") => {
      if (!redisUserId || isReorderingInProgress) return;
      setIsReorderingInProgress(true);

      try {
        // Step 1: Find the target note
        const targetNote = notes.find((note) => note.id === noteId);
        if (!targetNote) {
          setIsReorderingInProgress(false);
          return;
        }

        // Step 2: Get all notes with the same pin status
        const isPinned = targetNote.isPinned ?? false;
        const sameStatusNotes = notes.filter(
          (note) => (note.isPinned ?? false) === isPinned,
        );
        const sortedNotes = sortNotes(sameStatusNotes);

        // Step 3: Find target index and compute swap index
        const targetIndex = sortedNotes.findIndex((note) => note.id === noteId);
        if (targetIndex === -1) {
          setIsReorderingInProgress(false);
          return;
        }

        let swapIndex = -1;
        if (direction === "up" && targetIndex > 0) {
          swapIndex = targetIndex - 1;
        } else if (
          direction === "down" &&
          targetIndex < sortedNotes.length - 1
        ) {
          swapIndex = targetIndex + 1;
        }

        if (swapIndex === -1) {
          setIsReorderingInProgress(false);
          return;
        }

        // Step 4: Get the swap note
        const swapNote = sortedNotes[swapIndex];

        // Step 5: Get the order values
        const targetOrder = targetNote.order ?? 0;
        const swapOrder = swapNote.order ?? 0;

        // Step 6: Update UI optimistically
        setNotes((prevNotes) => {
          const updatedNotes = prevNotes.map((note) => {
            if (note.id === targetNote.id) {
              return { ...note, order: swapOrder };
            } else if (note.id === swapNote.id) {
              return { ...note, order: targetOrder };
            }
            return note;
          });

          return sortNotes(updatedNotes);
        });

        // Step 7: Prepare batch operations for more reliability
        const operations = [];

        // Add operations for target note
        if (targetNote.source === "redis") {
          operations.push(() =>
            updateNoteOrderAction(redisUserId, targetNote.id, swapOrder),
          );
        } else if (user?.id) {
          operations.push(() =>
            updateSupabaseNoteOrder(user.id, targetNote.id, swapOrder),
          );
        }

        // Add operations for swap note
        if (swapNote.source === "redis") {
          operations.push(() =>
            updateNoteOrderAction(redisUserId, swapNote.id, targetOrder),
          );
        } else if (user?.id) {
          operations.push(() =>
            updateSupabaseNoteOrder(user.id, swapNote.id, targetOrder),
          );
        }

        // Execute all operations
        const results = await Promise.allSettled(operations.map((op) => op()));

        // Check if any operations failed
        const failed = results.some((result) => result.status === "rejected");
        if (failed) {
          throw new Error("Some reordering operations failed");
        }

        // Mark that we've updated state
        markUpdated();

        // Refresh notes to ensure consistency
        await refreshNotes();
      } catch (error) {
        console.error("Error reordering note:", error);
        await refreshNotes();
      } finally {
        setIsReorderingInProgress(false);
      }
    },
    [
      redisUserId,
      notes,
      user?.id,
      sortNotes,
      refreshNotes,
      isReorderingInProgress,
      markUpdated,
    ],
  );

  /**
   * Delete a note
   */
  const deleteNoteHandler = useCallback(
    async (noteId: string) => {
      // Find the note to be deleted
      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote || !redisUserId) return;

      // Optimistic UI update
      setNotes((prevNotes) => prevNotes.filter((note) => note.id !== noteId));

      try {
        // Delete from the appropriate backend
        if (targetNote.source === "redis") {
          await deleteNoteAction(redisUserId, noteId);
        } else if (user?.id) {
          // For Supabase, use the auth user ID
          await deleteSupabaseNote(user.id, noteId);
        }

        // Mark that we've updated state
        markUpdated();
      } catch (error) {
        handleOperationError("delete note", error);
      }
    },
    [redisUserId, notes, user?.id, markUpdated, handleOperationError],
  );

  /**
   * Transfer a note between Redis and Supabase with optimistic UI updates
   * and improved visual feedback
   */
  const transferNote = useCallback(
    async (noteId: string, targetSource: NoteSource) => {
      if (!redisUserId) return;

      // Set the transferring state to show loading UI
      setTransferringNoteId(noteId);

      // Find the note to be transferred
      const sourceNote = notes.find((note) => note.id === noteId);
      if (!sourceNote) {
        setTransferringNoteId(null);
        return;
      }

      // Can't transfer to the same source
      if (sourceNote.source === targetSource) {
        setTransferringNoteId(null);
        return;
      }

      // For Supabase transfers, user must be authenticated
      if (targetSource === "supabase" && !isAuthenticated) {
        alert("You must be signed in to save notes to the cloud.");
        setTransferringNoteId(null);
        return;
      }

      try {
        // Add an artificial delay at the beginning to ensure the
        // transferring UI is visible to the user
        await new Promise((resolve) => setTimeout(resolve, 400));

        // Generate a new ID for the note in its new location
        const newNoteId = generateNoteId(notes.map((note) => note.id));

        // Create a copy of the note with the new ID and target source
        const noteToTransfer = {
          ...sourceNote,
          id: newNoteId,
          source: targetSource,
        };

        // Convert note to the target format
        const convertedNote = convertFromCombinedNote(
          noteToTransfer,
          targetSource,
        );

        // For Supabase notes, make sure the author is set correctly
        if (targetSource === "supabase" && user?.id) {
          convertedNote.author = user.id;
        }

        // Now perform the actual backend operations
        // First create the note in the target storage
        let createResult;
        if (targetSource === "redis") {
          createResult = await addNoteAction(redisUserId, convertedNote);
        } else if (user?.id) {
          createResult = await createSupabaseNote(convertedNote);
        } else {
          throw new Error("Cannot transfer to Supabase - not authenticated");
        }

        if (createResult?.success) {
          // If creation succeeded, delete from the source storage
          let deleteResult;
          if (sourceNote.source === "redis") {
            deleteResult = await deleteNoteAction(redisUserId, noteId);
          } else if (user?.id) {
            deleteResult = await deleteSupabaseNote(user.id, noteId);
          } else {
            throw new Error("Cannot delete from source storage");
          }

          // If both operations succeeded, update the UI
          if (deleteResult?.success) {
            console.log(
              `Note successfully transferred from ${sourceNote.source} to ${targetSource}`,
            );

            // Only after successful backend operations, update UI optimistically
            setNotes((prevNotes) => {
              const filteredNotes = prevNotes.filter(
                (note) => note.id !== noteId,
              );
              return sortNotes([...filteredNotes, noteToTransfer]);
            });

            // Mark that we've updated state
            markUpdated();
          } else {
            // If delete failed, we need to refresh from server
            console.error("Failed to delete source note:", deleteResult?.error);
            await refreshNotes();
          }
        } else {
          // If creation failed, don't update UI
          console.error(
            "Failed to create note in target storage:",
            createResult?.error,
          );
          await refreshNotes();
        }
      } catch (error) {
        handleOperationError("transfer note", error);
      } finally {
        // Keep the transferringNoteId state active for at least 400ms
        // to ensure UI visibility
        await new Promise((resolve) => setTimeout(resolve, 400));
        setTransferringNoteId(null);
      }
    },
    [
      redisUserId,
      notes,
      isAuthenticated,
      user?.id,
      sortNotes,
      convertFromCombinedNote,
      refreshNotes,
      markUpdated,
      handleOperationError,
    ],
  );

  // Initialize isMounted ref and get authentication status on mount
  useEffect(() => {
    // Set mounted flag at initialization
    isMounted.current = true;

    // Check auth status
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setIsAuthenticated(!!data.user);
    });

    // Subscribe to auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user || null);
        setIsAuthenticated(!!session?.user);
      },
    );

    return () => {
      // Clear it on cleanup
      isMounted.current = false;

      authListener.subscription.unsubscribe();

      // Clean up timeouts and intervals
      if (animationTimeout.current) {
        clearTimeout(animationTimeout.current);
      }

      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  // Effect: Initialize and load notes
  useEffect(() => {
    const loadNotes = async () => {
      try {
        // Get auth user first to ensure we have authentication
        const { data } = await supabase.auth.getUser();
        const authUser = data.user;

        const localRedisUserId = getUserId();
        const authUserId = authUser?.id;

        setRedisUserId(localRedisUserId);
        setUser(authUser);

        const authenticated = !!authUser;
        setIsAuthenticated(authenticated);

        // Load notes from both sources
        let initialNotes: CombinedNote[] = [];

        // Get Redis notes using redisUserId
        const redisResult = await getNotesByUserIdAction(localRedisUserId);

        if (redisResult.success && redisResult.notes) {
          const redisNotes = redisResult.notes.map((note) =>
            convertToCombinedNote(note, "redis"),
          );
          initialNotes = [...initialNotes, ...redisNotes];
        }

        // Get Supabase notes if authenticated using the authUserId
        if (authenticated && authUserId) {
          const supabaseResult = await getSupabaseNotesByUserId(authUserId);

          if (supabaseResult.success && supabaseResult.notes) {
            const supabaseNotes = supabaseResult.notes.map((note) =>
              convertToCombinedNote(note, "supabase"),
            );
            initialNotes = [...initialNotes, ...supabaseNotes];
          } else {
            console.error(
              "Failed to load Supabase notes:",
              supabaseResult.error,
            );
          }
        } else {
          console.log("Skipping Supabase notes - not authenticated");
        }

        // If no notes found, create a default note
        if (initialNotes.length === 0) {
          const defaultNoteSource = isAuthenticated ? "supabase" : "redis";
          const newNote = {
            ...JSON.parse(JSON.stringify(defaultNote)),
            id: generateNoteId([]),
            isPinned: false,
            isPrivate: false,
            isCollapsed: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            source: defaultNoteSource,
          };

          initialNotes.push(newNote);

          // Save default note
          const convertedNote = convertFromCombinedNote(
            newNote,
            defaultNoteSource,
          );

          if (defaultNoteSource === "redis") {
            await addNoteAction(localRedisUserId, convertedNote);
          } else if (authUserId) {
            // Ensure author is set correctly for Supabase
            convertedNote.author = authUserId;
            await createSupabaseNote(convertedNote);
          }
        }

        // Sort and set notes
        setNotes(sortNotes(initialNotes));
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load notes:", error);
        setIsLoading(false);
      } finally {
        isInitialLoad.current = false;
      }
    };

    loadNotes();
  }, [
    isAuthenticated,
    convertToCombinedNote,
    sortNotes,
    convertFromCombinedNote,
  ]);

  // Effect: Setup intelligent refresh interval
  useEffect(() => {
    if (!redisUserId || isInitialLoad.current) return;

    const refreshInterval = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastUpdateTimestamp;
      // Only refresh if no activity for 30 seconds
      if (timeSinceLastUpdate > 30000) {
        refreshNotes();
      }
    }, 10000); // Check every 10 seconds

    refreshIntervalRef.current = refreshInterval;

    return () => {
      clearInterval(refreshInterval);
    };
  }, [redisUserId, refreshNotes, lastUpdateTimestamp]);

  return {
    // State
    notes,
    isLoading,
    animating,
    newNoteId,
    userId: redisUserId,
    isAuthenticated,
    isReorderingInProgress,
    transferringNoteId,
    creationError,
    transferError,

    // Functions
    addNote,
    updatePinStatus,
    updatePrivacyStatus,
    updateCollapsedStatus,
    reorderNote,
    deleteNote: deleteNoteHandler,
    getNotePositionInfo,
    refreshNotes,
    transferNote,
    syncAndRenumberNotes,
  };
}
