"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  CombinedNote,
  NoteSource,
  CreateNoteInput,
  redisToCombi,
  combiToRedis,
  combiToSupabase,
  createNote,
  cloneNote,
  validateContentPreservation,
} from "@/types/combined-notes";
import { getUserId, generateNoteId } from "@/utils/general/notes";
import { createClient } from "@/utils/supabase/client";
import { incrementGlobalNoteCount } from "@/app/actions/counterActions";

// Redis actions
import {
  addNoteAction,
  getNotesByUserIdAction,
  updateNotePinStatusAction,
  updateNotePrivacyStatusAction,
  updateNoteCollapsedStatusAction,
  deleteNoteAction,
  updateNoteOrderAction,
} from "@/app/actions/redisActions";

// Supabase actions
import {
  createNote as createSupabaseNote,
  getNotesByUserId as getSupabaseNotesByUserId,
  updateNotePinStatus as updateSupabaseNotePinStatus,
  updateNotePrivacyStatus as updateSupabaseNotePrivacyStatus,
  updateNoteCollapsedStatus as updateSupabaseNoteCollapsedStatus,
  deleteNote as deleteSupabaseNote,
  updateSupabaseNoteOrder,
  batchUpdateNoteOrders,
} from "@/app/actions/supabaseActions";

import { defaultNote } from "@/data/defaults/default-note";

// Constants
const REFRESH_INTERVAL = 10000; // 10 seconds
const ACTIVITY_TIMEOUT = 30000; // 30 seconds

interface UseCombinedNotesReturn {
  // State
  notes: CombinedNote[];
  isLoading: boolean;
  animating: boolean;
  newNoteId: string | null;
  userId: string | null;
  isAuthenticated: boolean;
  isReorderingInProgress: boolean;
  transferringNoteId: string | null;
  creationError: boolean;
  transferError: boolean;

  // Functions
  addNote: () => void;
  updatePinStatus: (noteId: string, isPinned: boolean) => Promise<void>;
  updatePrivacyStatus: (noteId: string, isPrivate: boolean) => Promise<void>;
  updateCollapsedStatus: (
    noteId: string,
    isCollapsed: boolean,
  ) => Promise<void>;
  reorderNote: (noteId: string, direction: "up" | "down") => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  getNotePositionInfo: (noteId: string, pinStatus: boolean) => any;
  refreshNotes: () => Promise<void>;
  transferNote: (noteId: string, targetSource: NoteSource) => Promise<void>;
  syncAndRenumberNotes: () => Promise<void>;
}

export function useCombinedNotes(): UseCombinedNotesReturn {
  // Core State
  const [notes, setNotes] = useState<CombinedNote[]>([]);
  const [redisUserId, setRedisUserId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // UI State
  const [isLoading, setIsLoading] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [newNoteId, setNewNoteId] = useState<string | null>(null);
  const [isReorderingInProgress, setIsReorderingInProgress] = useState(false);
  const [transferringNoteId, setTransferringNoteId] = useState<string | null>(
    null,
  );
  const [creationError, setCreationError] = useState(false);
  const [transferError, setTransferError] = useState(false);

  // Activity tracking
  const [lastUpdateTimestamp, setLastUpdateTimestamp] = useState(Date.now());

  // Refs
  const supabase = createClient();
  const isMounted = useRef(true);
  const isInitialLoad = useRef(true);
  const animationTimeout = useRef<NodeJS.Timeout | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Helper Functions
  const markUpdated = useCallback(() => {
    setLastUpdateTimestamp(Date.now());
  }, []);

  const clearError = useCallback((errorType: "creation" | "transfer") => {
    if (errorType === "creation") {
      setCreationError(false);
    } else {
      setTransferError(false);
    }
  }, []);

  const handleError = useCallback(
    (operation: string, error: any, errorType?: "creation" | "transfer") => {
      console.error(`Failed to ${operation}:`, error);

      if (errorType === "creation") {
        setCreationError(true);
        setTimeout(() => clearError("creation"), 3000);
      } else if (errorType === "transfer") {
        setTransferError(true);
        setTimeout(() => clearError("transfer"), 3000);
      }
    },
    [clearError],
  );

  // Sorting and Organization
  const sortNotes = useCallback(
    (notesToSort: CombinedNote[]): CombinedNote[] => {
      return [...notesToSort].sort((a, b) => {
        // SPECIAL CASE: order 0 always goes to the very top (above pinned notes)
        if (a.order === 0 && b.order !== 0) return -1;
        if (a.order !== 0 && b.order === 0) return 1;
        if (a.order === 0 && b.order === 0) return b.updatedAt - a.updatedAt; // Latest first

        // 1. Pinned notes first
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;

        if (a.isPinned && b.isPinned) {
          // 2. Pinned with order numbers first
          if (a.order > 0 && b.order <= 0) return -1;
          if (a.order <= 0 && b.order > 0) return 1;
          if (a.order > 0 && b.order > 0) return a.order - b.order;
          // 3. Pinned without order by latest update
          return b.updatedAt - a.updatedAt;
        }

        if (!a.isPinned && !b.isPinned) {
          // 4. Unpinned with order numbers first
          if (a.order > 0 && b.order <= 0) return -1;
          if (a.order <= 0 && b.order > 0) return 1;
          if (a.order > 0 && b.order > 0) return a.order - b.order;
          // 5. Unpinned without order by latest update
          return b.updatedAt - a.updatedAt;
        }

        return 0;
      });
    },
    [],
  );

  const normaliseOrdering = useCallback(
    (notesToNormalise: CombinedNote[]): CombinedNote[] => {
      // Separate order 0 notes (these are new notes that need proper placement)
      const orderZeroNotes = notesToNormalise.filter(
        (note) => note.order === 0,
      );
      const regularNotes = notesToNormalise.filter((note) => note.order > 0);

      // Sort regular notes by existing order and creation date
      const sortedRegular = [...regularNotes].sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.createdAt - b.createdAt;
      });

      // Insert order 0 notes in their logical positions
      const pinnedRegular = sortedRegular.filter((note) => note.isPinned);
      const unpinnedRegular = sortedRegular.filter((note) => !note.isPinned);
      const pinnedOrderZero = orderZeroNotes.filter((note) => note.isPinned);
      const unpinnedOrderZero = orderZeroNotes.filter((note) => !note.isPinned);

      // 🔧 FIXED: New unpinned notes should come BEFORE existing unpinned notes
      const finalOrder = [
        ...pinnedRegular,
        ...pinnedOrderZero.sort((a, b) => b.createdAt - a.createdAt), // Latest first
        ...unpinnedOrderZero.sort((a, b) => b.createdAt - a.createdAt), // Latest first ← MOVED UP
        ...unpinnedRegular, // ← MOVED DOWN
      ];

      // Assign sequential order numbers starting from 1
      return finalOrder.map((note, index) => ({
        ...note,
        order: index + 1,
      }));
    },
    [],
  );

  // Data Loading
  const loadNotesFromRedis = useCallback(async (): Promise<CombinedNote[]> => {
    if (!redisUserId) return [];

    try {
      const result = await getNotesByUserIdAction(redisUserId);
      if (result.success && result.notes) {
        return result.notes.map(redisToCombi);
      }
    } catch (error) {
      console.error("Failed to load Redis notes:", error);
    }
    return [];
  }, [redisUserId]);

  const loadNotesFromSupabase = useCallback(async (): Promise<
    CombinedNote[]
  > => {
    if (!isAuthenticated) return [];

    try {
      const result = await getSupabaseNotesByUserId();
      if (result.success && result.notes) {
        return result.notes; // Already converted by Supabase actions
      }
    } catch (error) {
      console.error("Failed to load Supabase notes:", error);
    }
    return [];
  }, [isAuthenticated]);

  // Main refresh function
  const refreshNotes = useCallback(async () => {
    if (!redisUserId || !isMounted.current) return;

    try {
      const [redisNotes, supabaseNotes] = await Promise.all([
        loadNotesFromRedis(),
        loadNotesFromSupabase(),
      ]);

      const allNotes = [...redisNotes, ...supabaseNotes];
      const normalizedNotes = normaliseOrdering(allNotes);
      const sortedNotes = sortNotes(normalizedNotes);

      if (isMounted.current) {
        setNotes(sortedNotes);
        markUpdated();
      }
    } catch (error) {
      console.error("Failed to refresh notes:", error);
    }
  }, [
    redisUserId,
    loadNotesFromRedis,
    loadNotesFromSupabase,
    normaliseOrdering,
    sortNotes,
    markUpdated,
  ]);

  // Note Operations
  const updateNoteInState = useCallback(
    (noteId: string, updates: Partial<CombinedNote>) => {
      setNotes((prevNotes) => {
        const noteIndex = prevNotes.findIndex((note) => note.id === noteId);
        if (noteIndex === -1) return prevNotes;

        const newNotes = [...prevNotes];
        newNotes[noteIndex] = { ...newNotes[noteIndex], ...updates };

        // Re-sort if pin status or order changed
        if ("isPinned" in updates || "order" in updates) {
          return sortNotes(newNotes);
        }
        return newNotes;
      });
    },
    [sortNotes],
  );

  const saveNoteToStorage = useCallback(
    async (note: CombinedNote) => {
      if (note.source === "redis" && redisUserId) {
        const redisNote = combiToRedis(note);
        return addNoteAction(redisUserId, redisNote);
      } else if (note.source === "supabase" && isAuthenticated) {
        // FIXED: Pass CombinedNote directly, don't convert first
        return createSupabaseNote(note);
      }
      throw new Error(`Cannot save to ${note.source} storage`);
    },
    [redisUserId, isAuthenticated],
  );

  // Public API Functions
  const addNote = useCallback(() => {
    if (animating || !redisUserId) return;

    setAnimating(true);
    const noteSource: NoteSource = isAuthenticated ? "supabase" : "redis";

    incrementGlobalNoteCount().then(async (noteNumber) => {
      try {
        const newNoteInput: CreateNoteInput = {
          id: generateNoteId(notes.map((n) => n.id)),
          title: `Just Noted #${noteNumber}`,
          content: "",
        };

        const newNote = createNote(newNoteInput, noteSource);

        // 🎯 NEW BEHAVIOR: Use order 0 for immediate top placement
        newNote.order = 0; // ← This makes it appear above everything

        // Optimistic UI update
        setNewNoteId(newNote.id);
        setNotes((prevNotes) => sortNotes([...prevNotes, newNote]));

        // Save to storage
        const result = await saveNoteToStorage(newNote);

        if (result.success) {
          markUpdated();
          if (noteSource === "supabase") {
            await refreshNotes(); // Get server-generated data
          }
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        handleError("create note", error, "creation");
      } finally {
        setAnimating(false);
        setTimeout(() => setNewNoteId(null), 600);
      }
    });
  }, [
    animating,
    redisUserId,
    isAuthenticated,
    notes,
    sortNotes,
    saveNoteToStorage,
    markUpdated,
    handleError,
  ]);

  const updatePinStatus = useCallback(
    async (noteId: string, isPinned: boolean) => {
      if (!redisUserId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      // Optimistic update
      updateNoteInState(noteId, { isPinned });

      try {
        if (targetNote.source === "redis") {
          await updateNotePinStatusAction(redisUserId, noteId, isPinned);
        } else {
          await updateSupabaseNotePinStatus(noteId, isPinned);
        }
        markUpdated();
        await refreshNotes();
      } catch (error) {
        handleError("update pin status", error);
      }
    },
    [
      redisUserId,
      notes,
      updateNoteInState,
      markUpdated,
      refreshNotes,
      handleError,
    ],
  );

  const updatePrivacyStatus = useCallback(
    async (noteId: string, isPrivate: boolean) => {
      if (!redisUserId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      updateNoteInState(noteId, { isPrivate });

      try {
        if (targetNote.source === "redis") {
          await updateNotePrivacyStatusAction(redisUserId, noteId, isPrivate);
        } else {
          await updateSupabaseNotePrivacyStatus(noteId, isPrivate);
        }
        markUpdated();
      } catch (error) {
        handleError("update privacy status", error);
      }
    },
    [redisUserId, notes, updateNoteInState, markUpdated, handleError],
  );

  const updateCollapsedStatus = useCallback(
    async (noteId: string, isCollapsed: boolean) => {
      if (!redisUserId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      updateNoteInState(noteId, { isCollapsed });

      try {
        if (targetNote.source === "redis") {
          await updateNoteCollapsedStatusAction(
            redisUserId,
            noteId,
            isCollapsed,
          );
        } else {
          await updateSupabaseNoteCollapsedStatus(noteId, isCollapsed);
        }
        markUpdated();
      } catch (error) {
        handleError("update collapsed status", error);
      }
    },
    [redisUserId, notes, updateNoteInState, markUpdated, handleError],
  );

  const reorderNote = useCallback(
    async (noteId: string, direction: "up" | "down") => {
      if (!redisUserId || isReorderingInProgress) return;

      setIsReorderingInProgress(true);

      try {
        const targetNote = notes.find((note) => note.id === noteId);
        if (!targetNote) return;

        // Get notes with same pin status
        const sameStatusNotes = notes.filter(
          (note) => note.isPinned === targetNote.isPinned,
        );
        const sortedNotes = sortNotes(sameStatusNotes);

        const targetIndex = sortedNotes.findIndex((note) => note.id === noteId);
        let swapIndex = -1;

        if (direction === "up" && targetIndex > 0) {
          swapIndex = targetIndex - 1;
        } else if (
          direction === "down" &&
          targetIndex < sortedNotes.length - 1
        ) {
          swapIndex = targetIndex + 1;
        }

        if (swapIndex === -1) return;

        const swapNote = sortedNotes[swapIndex];
        const targetOrder = targetNote.order;
        const swapOrder = swapNote.order;

        // Optimistic UI update
        setNotes((prevNotes) => {
          const updated = prevNotes.map((note) => {
            if (note.id === targetNote.id) return { ...note, order: swapOrder };
            if (note.id === swapNote.id) return { ...note, order: targetOrder };
            return note;
          });
          return sortNotes(updated);
        });

        // Update backends
        const updates = [];
        if (targetNote.source === "redis") {
          updates.push(
            updateNoteOrderAction(redisUserId, targetNote.id, swapOrder),
          );
        } else {
          updates.push(updateSupabaseNoteOrder(targetNote.id, swapOrder));
        }

        if (swapNote.source === "redis") {
          updates.push(
            updateNoteOrderAction(redisUserId, swapNote.id, targetOrder),
          );
        } else {
          updates.push(updateSupabaseNoteOrder(swapNote.id, targetOrder));
        }

        await Promise.all(updates);
        markUpdated();
        await refreshNotes();
      } catch (error) {
        handleError("reorder note", error);
      } finally {
        setIsReorderingInProgress(false);
      }
    },
    [
      redisUserId,
      notes,
      isReorderingInProgress,
      sortNotes,
      markUpdated,
      refreshNotes,
      handleError,
    ],
  );

  const deleteNote = useCallback(
    async (noteId: string) => {
      if (!redisUserId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      // Optimistic removal
      setNotes((prevNotes) => prevNotes.filter((note) => note.id !== noteId));

      try {
        if (targetNote.source === "redis") {
          await deleteNoteAction(redisUserId, noteId);
        } else {
          await deleteSupabaseNote(noteId);
        }
        markUpdated();
      } catch (error) {
        handleError("delete note", error);
      }
    },
    [redisUserId, notes, markUpdated, handleError],
  );

  const transferNote = useCallback(
    async (noteId: string, targetSource: NoteSource) => {
      if (!redisUserId) return;

      // Step 1: Get the note from local state to determine source
      const localNote = notes.find((note) => note.id === noteId);
      if (!localNote || localNote.source === targetSource) return;

      if (targetSource === "supabase" && !isAuthenticated) {
        alert("You must be signed in to save notes to the cloud.");
        return;
      }

      setTransferringNoteId(noteId);

      try {
        // Step 2: Fetch the LATEST version from storage before transferring
        let sourceNote: CombinedNote | null = null;

        if (localNote.source === "redis") {
          const result = await getNotesByUserIdAction(redisUserId);
          if (result.success && result.notes) {
            const redisNote = result.notes.find((note) => note.id === noteId);
            if (redisNote) {
              sourceNote = redisToCombi(redisNote);
            }
          }
        } else {
          const result = await getSupabaseNotesByUserId();
          if (result.success && result.notes) {
            sourceNote =
              result.notes.find((note) => note.id === noteId) || null;
          }
        }

        // Fallback to local state if storage fetch fails
        if (!sourceNote) {
          console.warn(
            "Could not fetch latest version from storage, using local state",
          );
          sourceNote = localNote;
        }

        // Step 3: Create a deep clone with explicit content preservation
        const noteToTransfer = cloneNote(sourceNote);
        noteToTransfer.id = generateNoteId(notes.map((n) => n.id));
        noteToTransfer.source = targetSource;

        // Validate content preservation
        if (!validateContentPreservation(sourceNote, noteToTransfer)) {
          console.error("Content lost during cloning, attempting recovery");
          noteToTransfer.content = sourceNote.content;
        }

        console.log("🔄 Transfer Debug:", {
          originalContent: sourceNote.content,
          transferContent: noteToTransfer.content,
          contentLength: noteToTransfer.content?.length,
          sourceId: sourceNote.id,
          targetId: noteToTransfer.id,
          source: sourceNote.source,
          target: targetSource,
          freshFromStorage: sourceNote !== localNote,
        });

        // Step 4: Save to target storage
        let createResult;
        if (targetSource === "redis") {
          const redisNote = combiToRedis(noteToTransfer);
          createResult = await addNoteAction(redisUserId, redisNote);
        } else {
          createResult = await createSupabaseNote(noteToTransfer);
        }

        if (!createResult?.success) {
          throw new Error(
            createResult?.error || "Failed to create note in target storage",
          );
        }

        // Step 5: Delete from source storage
        let deleteResult;
        if (sourceNote.source === "redis") {
          deleteResult = await deleteNoteAction(redisUserId, noteId);
        } else {
          deleteResult = await deleteSupabaseNote(noteId);
        }

        if (!deleteResult?.success) {
          console.error("Failed to delete source note:", deleteResult?.error);
          // Don't throw here - note was created successfully
        }

        // Step 6: Update UI with fresh data
        setNotes((prevNotes) => {
          const filtered = prevNotes.filter((note) => note.id !== noteId);
          return sortNotes([...filtered, noteToTransfer]);
        });

        // Step 7: Refresh all notes to ensure consistency
        await refreshNotes();

        markUpdated();
        console.log(
          `✅ Note transferred from ${sourceNote.source} to ${targetSource}`,
        );
      } catch (error) {
        console.error("❌ Transfer failed:", error);
        handleError("transfer note", error, "transfer");
      } finally {
        setTransferringNoteId(null);
      }
    },
    [
      redisUserId,
      notes,
      isAuthenticated,
      sortNotes,
      markUpdated,
      handleError,
      refreshNotes,
    ],
  );

  const syncAndRenumberNotes = useCallback(async () => {
    if (!redisUserId) return;

    setIsReorderingInProgress(true);

    try {
      const renumberedNotes = normaliseOrdering(notes);
      setNotes(sortNotes(renumberedNotes));

      // Batch update backends
      const redisUpdates = renumberedNotes
        .filter((note) => note.source === "redis")
        .map((note) => ({ id: note.id, order: note.order }));

      const supabaseUpdates = renumberedNotes
        .filter((note) => note.source === "supabase")
        .map((note) => ({ id: note.id, order: note.order }));

      const updates = [];

      // Redis updates
      for (const update of redisUpdates) {
        updates.push(
          updateNoteOrderAction(redisUserId, update.id, update.order),
        );
      }

      // Supabase batch update
      if (supabaseUpdates.length > 0) {
        updates.push(batchUpdateNoteOrders(supabaseUpdates));
      }

      await Promise.allSettled(updates);
      markUpdated();
      await refreshNotes();
    } catch (error) {
      handleError("sync and renumber notes", error);
    } finally {
      setIsReorderingInProgress(false);
    }
  }, [
    redisUserId,
    notes,
    normaliseOrdering,
    sortNotes,
    markUpdated,
    refreshNotes,
    handleError,
  ]);

  const getNotePositionInfo = useCallback(
    (noteId: string, pinStatus: boolean) => {
      const pinnedNotes = notes.filter((note) => note.isPinned);
      const unpinnedNotes = notes.filter((note) => !note.isPinned);

      if (pinStatus) {
        const index = pinnedNotes.findIndex((note) => note.id === noteId);
        return {
          isFirstPinned: index === 0,
          isLastPinned: index === pinnedNotes.length - 1,
          isFirstUnpinned: false,
          isLastUnpinned: false,
        };
      } else {
        const index = unpinnedNotes.findIndex((note) => note.id === noteId);
        return {
          isFirstPinned: false,
          isLastPinned: false,
          isFirstUnpinned: index === 0,
          isLastUnpinned: index === unpinnedNotes.length - 1,
        };
      }
    },
    [notes],
  );

  // Effects
  useEffect(() => {
    isMounted.current = true;

    // Setup auth listener
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setIsAuthenticated(!!data.user);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user || null);
        setIsAuthenticated(!!session?.user);
      },
    );

    return () => {
      isMounted.current = false;
      authListener.subscription.unsubscribe();

      if (animationTimeout.current) clearTimeout(animationTimeout.current);
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, []);

  // Initial load
  useEffect(() => {
    const initializeNotes = async () => {
      try {
        const localRedisUserId = getUserId();
        setRedisUserId(localRedisUserId);

        const [redisNotes, supabaseNotes] = await Promise.all([
          getNotesByUserIdAction(localRedisUserId).then((result) =>
            result.success && result.notes
              ? result.notes.map(redisToCombi)
              : [],
          ),
          isAuthenticated
            ? getSupabaseNotesByUserId().then((result) =>
                result.success && result.notes ? result.notes : [],
              )
            : Promise.resolve([]),
        ]);

        let allNotes = [...redisNotes, ...supabaseNotes];

        // Create default note if none exist
        if (allNotes.length === 0) {
          const defaultNoteSource: NoteSource = isAuthenticated
            ? "supabase"
            : "redis";

          const newNoteInput: CreateNoteInput = {
            id: generateNoteId([]),
            title: "Just Noted #1",
            content: "",
          };

          const newNote = createNote(newNoteInput, defaultNoteSource);

          if (defaultNoteSource === "redis") {
            await addNoteAction(localRedisUserId, combiToRedis(newNote));
          } else {
            await createSupabaseNote(newNote);
          }

          allNotes = [newNote];
        }

        setNotes(sortNotes(normaliseOrdering(allNotes)));
      } catch (error) {
        console.error("Failed to initialize notes:", error);
      } finally {
        setIsLoading(false);
        isInitialLoad.current = false;
      }
    };

    initializeNotes();
  }, [isAuthenticated, sortNotes, normaliseOrdering]);

  // Setup refresh interval
  useEffect(() => {
    if (!redisUserId || isInitialLoad.current) return;

    const interval = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastUpdateTimestamp;
      if (timeSinceLastUpdate > ACTIVITY_TIMEOUT) {
        refreshNotes();
      }
    }, REFRESH_INTERVAL);

    refreshIntervalRef.current = interval;
    return () => clearInterval(interval);
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
    deleteNote,
    getNotePositionInfo,
    refreshNotes,
    transferNote,
    syncAndRenumberNotes,
  };
}
