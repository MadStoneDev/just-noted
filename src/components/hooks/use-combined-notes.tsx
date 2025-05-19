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
  reorderNoteAction,
  deleteNoteAction,
  updateNoteAction,
  updateNoteTitleAction,
  updateNoteOrderAction,
} from "@/app/actions/redisActions";

import {
  createNote as createSupabaseNote,
  updateNote as updateSupabaseNote,
  getNotesByUserId as getSupabaseNotesByUserId,
  updateNoteTitle as updateSupabaseNoteTitle,
  updateNotePinStatus as updateSupabaseNotePinStatus,
  updateNotePrivacyStatus as updateSupabaseNotePrivacyStatus,
  updateNoteCollapsedStatus as updateSupabaseNoteCollapsedStatus,
  reorderNote as reorderSupabaseNote,
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
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [newNoteId, setNewNoteId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReorderingInProgress, setIsReorderingInProgress] = useState(false);

  const [creationError, setCreationError] = useState(false);
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
   * Sort notes based on pin status, order, and creation date
   */

  /**
   * Updated sortNotes that respects absolute order but displays pinned notes first
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
   * Convert a Note to a CombinedNote with source information
   */
  const convertToRedisNote = useCallback(
    (note: CombinedNote): RedisNote => {
      return {
        id: note.id,
        author: note.author || userId || "",
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
    [userId],
  );

  /**
   * Convert CombinedNote back to appropriate format for Redis or Supabase
   */
  const convertToSupabaseNote = useCallback(
    (note: CombinedNote): Partial<SupabaseNote> => {
      // Use Partial<SupabaseNote> to allow us to set only the fields we need
      return {
        id: note.id,
        author: user?.id || note.author || userId || null,
        title: note.title || null,
        content: note.content || null,
        is_pinned: note.isPinned === undefined ? null : note.isPinned,
        is_private: note.isPrivate === undefined ? null : note.isPrivate,
        is_collapsed: note.isCollapsed === undefined ? null : note.isCollapsed,
        order: note.order === undefined ? null : note.order,
        created_at: new Date(note.createdAt).toISOString(),
        updated_at: new Date(note.updatedAt).toISOString(),
      };
    },
    [userId],
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
    if (!userId || !isMounted.current) return;

    try {
      // Get Redis notes using the local userId
      const redisResult = await getNotesByUserIdAction(userId);
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
    } catch (error) {
      console.error("Failed to refresh notes:", error);
    }
  }, [
    userId,
    isAuthenticated,
    user?.id,
    convertToCombinedNote,
    normalizeNotesOrdering,
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
              userId as string,
              note.id,
              note.order as number,
            ),
          );
        } else {
          updatePromises.push(
            updateSupabaseNoteOrder(
              userId as string,
              note.id,
              note.order as number,
            ),
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
    [userId],
  );

  /**
   * Sync all notes with backend and normalize order numbers
   * Uses absolute ordering regardless of pinned status
   */
  const syncAndRenumberNotes = useCallback(async () => {
    if (!userId) return;
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

      // Prepare update promises
      const updatePromises = [];

      // Update Redis notes
      for (const note of redisNotes) {
        const redisNote = convertFromCombinedNote(note, "redis");
        updatePromises.push(
          // Update the note content, title, pin status, privacy, and most importantly: order
          updateNoteAction(userId, note.id, note.content)
            .then(() => updateNoteTitleAction(userId, note.id, note.title))
            .then(() =>
              updateNotePinStatusAction(userId, note.id, !!note.isPinned),
            )
            .then(() =>
              updateNotePrivacyStatusAction(userId, note.id, !!note.isPrivate),
            )
            .then(() =>
              updateNoteOrderAction(userId, note.id, note.order as number),
            )
            .catch((err) =>
              console.error(`Failed to update Redis note ${note.id}:`, err),
            ),
        );
      }

      // Update Supabase notes if authenticated
      if (isAuthenticated) {
        for (const note of supabaseNotes) {
          const supabaseNote = convertFromCombinedNote(note, "supabase");
          updatePromises.push(
            updateSupabaseNote(userId, note.id, note.content)
              .then(() => updateSupabaseNoteTitle(userId, note.id, note.title))
              .then(() =>
                updateSupabaseNotePinStatus(userId, note.id, !!note.isPinned),
              )
              .then(() =>
                updateSupabaseNotePrivacyStatus(
                  userId,
                  note.id,
                  !!note.isPrivate,
                ),
              )
              .then(() =>
                updateSupabaseNoteOrder(userId, note.id, note.order as number),
              )
              .catch((err) =>
                console.error(
                  `Failed to update Supabase note ${note.id}:`,
                  err,
                ),
              ),
          );
        }
      }

      // Wait for all updates to complete
      await Promise.allSettled(updatePromises);

      // Refresh notes from both sources
      await refreshNotes();
    } catch (error) {
      console.error("Error syncing and renumbering notes:", error);
    } finally {
      setIsReorderingInProgress(false);
    }
  }, [
    userId,
    notes,
    sortNotes,
    convertFromCombinedNote,
    isAuthenticated,
    refreshNotes,
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
   * Add a new note
   */
  const addNote = useCallback(() => {
    if (animating || !userId) {
      console.log("Early return due to:", { animating, userId });
      return;
    }

    console.log("ADD NOTE - Auth status:", {
      isAuthenticated,
      userId,
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

      // Save note to appropriate backend
      if (noteSource === "redis") {
        console.log("Saving to REDIS");
        const redisNote = convertFromCombinedNote(newNote, "redis");
        addNoteAction(userId, redisNote)
          .then((result) => {
            console.log("Redis save result:", result);
            setAnimating(false); // Reset animation state on completion

            // After adding the note, update all other notes' order numbers in the background
            updateAllNoteOrders(updatedNotes);
          })
          .catch((error) => {
            console.error("Failed to add note to Redis:", error);
            setAnimating(false); // Reset animation state on error
            setCreationError(true);
          });
      }

      // When saving to Supabase
      if (noteSource === "supabase") {
        console.log("Saving to SUPABASE");

        // Convert to Supabase format
        const supabaseNote = convertToSupabaseNote(newNote);

        // Make sure author is set to the auth user ID
        supabaseNote.author = user?.id;

        console.log("Creating NEW Supabase note:", supabaseNote);

        // Use the createSupabaseNote function
        createSupabaseNote(supabaseNote)
          .then((result) => {
            console.log("Supabase create result:", result);
            setAnimating(false);
            if (result.success) {
              // After adding the note, update all other notes' order numbers in the background
              updateAllNoteOrders(updatedNotes);
              refreshNotes();
            }
          })
          .catch((error) => {
            console.error("Failed to create Supabase note:", error);
            setAnimating(false);
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
    });
  }, [
    animating,
    userId,
    notes,
    isAuthenticated,
    sortNotes,
    convertFromCombinedNote,
    refreshNotes,
  ]);

  // Helper function to update order numbers for all notes
  const updateAllNoteOrders = useCallback(
    async (notesToUpdate: CombinedNote[]) => {
      try {
        const updatePromises = [];

        for (const note of notesToUpdate) {
          // Skip notes without valid order
          if (note.order === undefined || note.order === null) continue;

          if (note.source === "redis") {
            updatePromises.push(
              updateNoteOrderAction(userId as string, note.id, note.order),
            );
          } else {
            updatePromises.push(
              updateSupabaseNoteOrder(userId as string, note.id, note.order),
            );
          }
        }

        await Promise.all(updatePromises);
      } catch (error) {
        console.error("Failed to update all note orders:", error);
      }
    },
    [userId],
  );

  /**
   * Update a note's pin status
   */
  const updatePinStatus = useCallback(
    async (noteId: string, isPinned: boolean) => {
      if (!userId) return;

      // Find the note to be updated
      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      // Optimistic UI update
      setNotes((prevNotes) => {
        const updatedNotes = prevNotes.map((note) =>
          note.id === noteId ? { ...note, isPinned } : note,
        );
        return sortNotes(updatedNotes);
      });

      try {
        // Update in the appropriate backend
        if (targetNote.source === "redis") {
          await updateNotePinStatusAction(userId, noteId, isPinned);
        } else {
          await updateSupabaseNotePinStatus(userId, noteId, isPinned);
        }

        // Refresh notes to ensure correct order
        await refreshNotes();
      } catch (error) {
        console.error("Failed to update pin status:", error);
        // Revert optimistic update on error
        refreshNotes();
      }
    },
    [userId, notes, sortNotes, refreshNotes],
  );

  /**
   * Update a note's privacy status
   */
  const updatePrivacyStatus = useCallback(
    async (noteId: string, isPrivate: boolean) => {
      if (!userId) return;

      // Find the note to be updated
      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      // Optimistic UI update
      setNotes((prevNotes) => {
        const updatedNotes = prevNotes.map((note) =>
          note.id === noteId ? { ...note, isPrivate } : note,
        );
        return sortNotes(updatedNotes);
      });

      try {
        // Update in the appropriate backend
        if (targetNote.source === "redis") {
          await updateNotePrivacyStatusAction(userId, noteId, isPrivate);
        } else {
          await updateSupabaseNotePrivacyStatus(userId, noteId, isPrivate);
        }
      } catch (error) {
        console.error("Failed to update privacy status:", error);
        // Revert optimistic update on error
        refreshNotes();
      }
    },
    [userId, notes, sortNotes, refreshNotes],
  );

  /**
   * Update a note's collapsed status
   */
  const updateCollapsedStatus = useCallback(
    async (noteId: string, isCollapsed: boolean) => {
      if (!userId) return;

      // Find the note to be updated
      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      // Optimistic UI update
      setNotes((prevNotes) => {
        const updatedNotes = prevNotes.map((note) =>
          note.id === noteId ? { ...note, isCollapsed } : note,
        );
        return updatedNotes;
      });

      try {
        // Update in the appropriate backend
        if (targetNote.source === "redis") {
          await updateNoteCollapsedStatusAction(userId, noteId, isCollapsed);
        } else {
          await updateSupabaseNoteCollapsedStatus(userId, noteId, isCollapsed);
        }
      } catch (error) {
        console.error("Failed to update collapsed status:", error);
        // Revert optimistic update on error
        refreshNotes();
      }
    },
    [userId, notes, refreshNotes],
  );

  /**
   * Reorder a note (move up/down) using the step-by-step approach that works reliably for both Redis and Supabase notes
   */
  const reorderNote = useCallback(
    async (noteId: string, direction: "up" | "down") => {
      if (!userId || isReorderingInProgress) return;
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

        // Step 7: Create and assign temporary orders to avoid conflicts
        const tempTargetOrder = -9999;
        const tempSwapOrder = -8888;

        // For Supabase operations, use the auth user ID if available
        const authUserId = user?.id;

        // Step 8: Update with temporary orders first
        // First update target note to temp order
        if (targetNote.source === "redis") {
          await updateNoteOrderAction(userId, targetNote.id, tempTargetOrder);
        } else if (targetNote.source === "supabase" && authUserId) {
          await updateSupabaseNoteOrder(
            authUserId,
            targetNote.id,
            tempTargetOrder,
          );
        }

        // Then update swap note to temp order
        if (swapNote.source === "redis") {
          await updateNoteOrderAction(userId, swapNote.id, tempSwapOrder);
        } else if (swapNote.source === "supabase" && authUserId) {
          await updateSupabaseNoteOrder(authUserId, swapNote.id, tempSwapOrder);
        }

        // Step 9: Now update to final orders
        // Update target note to final order
        if (targetNote.source === "redis") {
          await updateNoteOrderAction(userId, targetNote.id, swapOrder);
        } else if (targetNote.source === "supabase" && authUserId) {
          await updateSupabaseNoteOrder(authUserId, targetNote.id, swapOrder);
        }

        // Update swap note to final order
        if (swapNote.source === "redis") {
          await updateNoteOrderAction(userId, swapNote.id, targetOrder);
        } else if (swapNote.source === "supabase" && authUserId) {
          await updateSupabaseNoteOrder(authUserId, swapNote.id, targetOrder);
        }

        // Step 10: Refresh notes to ensure consistency
        await refreshNotes();
      } catch (error) {
        console.error("Error reordering note:", error);
        // Refresh to restore correct state
        await refreshNotes();
      } finally {
        setIsReorderingInProgress(false);
      }
    },
    [userId, notes, sortNotes, refreshNotes, isReorderingInProgress, user?.id],
  );

  /**
   * Delete a note
   */
  const deleteNoteHandler = useCallback(
    async (noteId: string) => {
      // Find the note to be deleted
      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote || !userId) return;

      // Optimistic UI update
      setNotes((prevNotes) => prevNotes.filter((note) => note.id !== noteId));

      try {
        // Delete from the appropriate backend
        if (targetNote.source === "redis") {
          await deleteNoteAction(userId, noteId);
        } else {
          // For Supabase, ensure we're using the deleteSupabaseNote function
          await deleteSupabaseNote(userId, noteId);
        }
      } catch (error) {
        console.error("Failed to delete note:", error);
        // Revert optimistic update on error
        refreshNotes();
      }
    },
    [userId, notes, refreshNotes],
  );

  /**
   * Transfer a note between Redis and Supabase with optimistic UI updates
   * and improved visual feedback
   */
  const transferNote = useCallback(
    async (noteId: string, targetSource: NoteSource) => {
      if (!userId) return;

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
        await new Promise((resolve) => setTimeout(resolve, 800));

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
        if (targetSource === "supabase") {
          convertedNote.author = user?.id;
        }

        // Now perform the actual backend operations
        // First create the note in the target storage
        let createResult;
        if (targetSource === "redis") {
          createResult = await addNoteAction(userId, convertedNote);
        } else {
          createResult = await createSupabaseNote(convertedNote);
        }

        if (createResult.success) {
          // If creation succeeded, delete from the source storage
          let deleteResult;
          if (sourceNote.source === "redis") {
            deleteResult = await deleteNoteAction(userId, noteId);
          } else {
            deleteResult = await deleteSupabaseNote(userId, noteId);
          }

          // Add a delay before completing the transfer UI
          await new Promise((resolve) => setTimeout(resolve, 400));

          // If both operations succeeded, update the UI
          if (deleteResult.success) {
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

            // Show completion UI for a meaningful duration
            await new Promise((resolve) => setTimeout(resolve, 800));
          } else {
            // If delete failed, we need to refresh from server
            console.error("Failed to delete source note:", deleteResult.error);
            await refreshNotes();
          }
        } else {
          // If creation failed, don't update UI
          console.error(
            "Failed to create note in target storage:",
            createResult.error,
          );
          await refreshNotes();
        }
      } catch (error) {
        console.error(`Failed to transfer note to ${targetSource}:`, error);
        // In case of any error, refresh from server to get the correct state
        await refreshNotes();
      } finally {
        // Keep the transferringNoteId state active for at least 800ms
        // to ensure UI visibility
        await new Promise((resolve) => setTimeout(resolve, 500));
        setTransferringNoteId(null);
      }
    },
    [
      userId,
      notes,
      isAuthenticated,
      convertFromCombinedNote,
      refreshNotes,
      user?.id,
      sortNotes,
    ],
  );

  // Check authentication status on mount
  useEffect(() => {
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
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Effect: Initialize and load notes
  useEffect(() => {
    const loadNotes = async () => {
      try {
        // Get auth user first to ensure we have authentication
        const { data } = await supabase.auth.getUser();
        const authUser = data.user;

        const id = authUser?.id || getUserId();
        setUserId(id);
        setUser(authUser);
        const authenticated = !!authUser;
        setIsAuthenticated(authenticated);

        // Load notes from both sources
        let initialNotes: CombinedNote[] = [];

        // Get Redis notes
        const redisResult = await getNotesByUserIdAction(id);

        if (redisResult.success && redisResult.notes) {
          const redisNotes = redisResult.notes.map((note) =>
            convertToCombinedNote(note, "redis"),
          );
          initialNotes = [...initialNotes, ...redisNotes];
        }

        // Get Supabase notes if authenticated
        if (authenticated) {
          const supabaseResult = await getSupabaseNotesByUserId(id);

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
            await addNoteAction(id, convertedNote);
          } else {
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

    return () => {
      isMounted.current = false;

      // Clean up timeouts and intervals
      if (animationTimeout.current) {
        clearTimeout(animationTimeout.current);
      }

      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [
    isAuthenticated,
    convertToCombinedNote,
    sortNotes,
    convertFromCombinedNote,
  ]);

  // Effect: Setup refresh interval
  useEffect(() => {
    if (!userId || isInitialLoad.current) return;

    const refreshInterval = setInterval(() => {
      refreshNotes();
    }, 30000); // Refresh every 30 seconds

    refreshIntervalRef.current = refreshInterval;

    return () => {
      clearInterval(refreshInterval);
    };
  }, [userId, refreshNotes]);

  return {
    // State
    notes,
    isLoading,
    animating,
    newNoteId,
    userId,
    isAuthenticated,
    isReorderingInProgress,
    transferringNoteId,

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
