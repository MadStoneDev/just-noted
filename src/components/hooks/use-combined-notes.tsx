"use client";

import { useState, useEffect, useRef, useCallback } from "react";

import { noteOperation } from "@/app/actions/notes";

import {
  CombinedNote,
  NoteSource,
  CreateNoteInput,
  redisToCombi,
  combiToRedis,
  createNote,
  cloneNote,
  validateContentPreservation,
} from "@/types/combined-notes";

import { createClient } from "@/utils/supabase/client";
import { getUserId, generateNoteId } from "@/utils/general/notes";
import { incrementGlobalNoteCount } from "@/app/actions/counterActions";

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

// Constants
const REFRESH_INTERVAL = 10000;
const ACTIVITY_TIMEOUT = 30000;
const HAS_INITIALISED_KEY = "justnoted_has_initialised"; // NEW: Track if user has ever had notes

interface UseCombinedNotesReturn {
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
  registerNoteFlush: (noteId: string, flushFn: () => void) => void;
  unregisterNoteFlush: (noteId: string) => void;
  refreshSingleNote: (noteId: string) => Promise<CombinedNote | null>;
}

export function useCombinedNotes(): UseCombinedNotesReturn {
  // Core State
  const [notes, setNotes] = useState<CombinedNote[]>([]);
  const [redisUserId, setRedisUserId] = useState<string | null>(null);
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
  const hasInitialisedRef = useRef(false); // NEW: Track if initialization completed
  const animationTimeout = useRef<NodeJS.Timeout | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const noteFlushFunctionsRef = useRef<Map<string, () => void>>(new Map());
  const authCheckedRef = useRef(false);

  // Helper Functions
  const registerNoteFlush = useCallback(
    (noteId: string, flushFn: () => void) => {
      noteFlushFunctionsRef.current.set(noteId, flushFn);
    },
    [],
  );

  const unregisterNoteFlush = useCallback((noteId: string) => {
    noteFlushFunctionsRef.current.delete(noteId);
  }, []);

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
        if (a.order === 0 && b.order !== 0) return -1;
        if (a.order !== 0 && b.order === 0) return 1;
        if (a.order === 0 && b.order === 0) return b.updatedAt - a.updatedAt;

        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;

        if (a.isPinned && b.isPinned) {
          if (a.order > 0 && b.order <= 0) return -1;
          if (a.order <= 0 && b.order > 0) return 1;
          if (a.order > 0 && b.order > 0) return a.order - b.order;
          return b.updatedAt - a.updatedAt;
        }

        if (!a.isPinned && !b.isPinned) {
          if (a.order > 0 && b.order <= 0) return -1;
          if (a.order <= 0 && b.order > 0) return 1;
          if (a.order > 0 && b.order > 0) return a.order - b.order;
          return b.updatedAt - a.updatedAt;
        }

        return 0;
      });
    },
    [],
  );

  const normaliseOrdering = useCallback(
    (notesToNormalise: CombinedNote[]): CombinedNote[] => {
      const orderZeroNotes = notesToNormalise.filter(
        (note) => note.order === 0,
      );
      const regularNotes = notesToNormalise.filter((note) => note.order > 0);

      const sortedRegular = [...regularNotes].sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.createdAt - b.createdAt;
      });

      const pinnedRegular = sortedRegular.filter((note) => note.isPinned);
      const unpinnedRegular = sortedRegular.filter((note) => !note.isPinned);
      const pinnedOrderZero = orderZeroNotes.filter((note) => note.isPinned);
      const unpinnedOrderZero = orderZeroNotes.filter((note) => !note.isPinned);

      const finalOrder = [
        ...pinnedRegular,
        ...pinnedOrderZero.sort((a, b) => b.createdAt - a.createdAt),
        ...unpinnedOrderZero.sort((a, b) => b.createdAt - a.createdAt),
        ...unpinnedRegular,
      ];

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
      const result = await noteOperation("redis", {
        operation: "getAll",
        userId: redisUserId,
      });

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
        return result.notes;
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
      const normalisedNotes = normaliseOrdering(allNotes);
      const sortedNotes = sortNotes(normalisedNotes);

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

        return noteOperation("redis", {
          operation: "create",
          userId: redisUserId,
          note: redisNote,
        });
      } else if (note.source === "supabase" && isAuthenticated) {
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

    // FIXED: Mark that user has initialised when they create their first note
    if (!localStorage.getItem(HAS_INITIALISED_KEY)) {
      localStorage.setItem(HAS_INITIALISED_KEY, "true");
    }

    incrementGlobalNoteCount().then(async (noteNumber) => {
      try {
        const newNoteInput: CreateNoteInput = {
          id: generateNoteId(notes.map((n) => n.id)),
          title: `Just Noted #${noteNumber}`,
          content: "",
        };

        const newNote = createNote(newNoteInput, noteSource);
        newNote.order = 0;

        setNewNoteId(newNote.id);
        setNotes((prevNotes) => sortNotes([...prevNotes, newNote]));

        const result = await saveNoteToStorage(newNote);

        if (result.success) {
          markUpdated();
          if (noteSource === "supabase") {
            await refreshNotes();
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
    refreshNotes,
  ]);

  const updatePinStatus = useCallback(
    async (noteId: string, isPinned: boolean) => {
      if (!redisUserId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      updateNoteInState(noteId, { isPinned });

      try {
        if (targetNote.source === "redis") {
          await noteOperation("redis", {
            operation: "updatePin",
            userId: redisUserId,
            noteId: noteId,
            isPinned: isPinned,
          });
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
          await noteOperation("redis", {
            operation: "updatePrivacy",
            userId: redisUserId,
            noteId: noteId,
            isPrivate: isPrivate,
          });
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
          await noteOperation("redis", {
            operation: "updateCollapsed",
            userId: redisUserId,
            noteId: noteId,
            isCollapsed: isCollapsed,
          });
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

        setNotes((prevNotes) => {
          const updated = prevNotes.map((note) => {
            if (note.id === targetNote.id) return { ...note, order: swapOrder };
            if (note.id === swapNote.id) return { ...note, order: targetOrder };
            return note;
          });
          return sortNotes(updated);
        });

        const updates = [];
        if (targetNote.source === "redis") {
          updates.push(
            noteOperation("redis", {
              operation: "updateOrder",
              userId: redisUserId,
              noteId: targetNote.id,
              order: swapOrder,
            }),
          );
        } else {
          updates.push(updateSupabaseNoteOrder(targetNote.id, swapOrder));
        }

        if (swapNote.source === "redis") {
          updates.push(
            noteOperation("redis", {
              operation: "updateOrder",
              userId: redisUserId,
              noteId: swapNote.id,
              order: targetOrder,
            }),
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

      // FIXED: Prevent deleting the last note
      if (notes.length === 1) {
        alert(
          "You must have at least one note. Create a new note before deleting this one.",
        );
        return;
      }

      // Optimistic removal
      setNotes((prevNotes) => prevNotes.filter((note) => note.id !== noteId));

      try {
        if (targetNote.source === "redis") {
          await noteOperation("redis", {
            operation: "delete",
            userId: redisUserId,
            noteId: noteId,
          });
        } else {
          await deleteSupabaseNote(noteId);
        }
        markUpdated();
      } catch (error) {
        handleError("delete note", error);
        // Revert on error
        await refreshNotes();
      }
    },
    [redisUserId, notes, markUpdated, handleError, refreshNotes],
  );

  const transferNote = useCallback(
    async (noteId: string, targetSource: NoteSource) => {
      if (!redisUserId) return;

      const localNote = notes.find((note) => note.id === noteId);
      if (!localNote || localNote.source === targetSource) return;

      if (targetSource === "supabase" && !isAuthenticated) {
        alert("You must be signed in to save notes to the cloud.");
        return;
      }

      setTransferringNoteId(noteId);

      try {
        let sourceNote: CombinedNote | null = null;

        if (localNote.source === "redis") {
          const result = await noteOperation("redis", {
            operation: "getAll",
            userId: redisUserId,
          });

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

        if (!sourceNote) {
          console.warn(
            "Could not fetch latest version from storage, using local state",
          );
          sourceNote = localNote;
        }

        const noteToTransfer = cloneNote(sourceNote);
        noteToTransfer.id = generateNoteId(notes.map((n) => n.id));
        noteToTransfer.source = targetSource;

        if (!validateContentPreservation(sourceNote, noteToTransfer)) {
          console.error("Content lost during cloning, attempting recovery");
          noteToTransfer.content = sourceNote.content;
        }

        let createResult;
        if (targetSource === "redis") {
          const redisNote = combiToRedis(noteToTransfer);

          createResult = await noteOperation("redis", {
            operation: "create",
            userId: redisUserId,
            note: redisNote,
          });
        } else {
          createResult = await createSupabaseNote(noteToTransfer);
        }

        if (!createResult?.success) {
          throw new Error(
            createResult?.error || "Failed to create note in target storage",
          );
        }

        let deleteResult;
        if (sourceNote.source === "redis") {
          deleteResult = await noteOperation("redis", {
            operation: "delete",
            userId: redisUserId,
            noteId: noteId,
          });
        } else {
          deleteResult = await deleteSupabaseNote(noteId);
        }

        if (!deleteResult?.success) {
          console.error("Failed to delete source note:", deleteResult?.error);
        }

        setNotes((prevNotes) => {
          const filtered = prevNotes.filter((note) => note.id !== noteId);
          return sortNotes([...filtered, noteToTransfer]);
        });

        await refreshNotes();
        markUpdated();
      } catch (error) {
        console.error("Transfer failed:", error);
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
      const flushPromises: Promise<void>[] = [];
      noteFlushFunctionsRef.current.forEach((flushFn) => {
        flushPromises.push(
          new Promise<void>((resolve) => {
            flushFn();
            setTimeout(resolve, 100);
          }),
        );
      });

      if (flushPromises.length > 0) {
        await Promise.all(flushPromises);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const renumberedNotes = normaliseOrdering(notes);
      setNotes(sortNotes(renumberedNotes));

      const redisUpdates = renumberedNotes
        .filter((note) => note.source === "redis")
        .map((note) => ({ id: note.id, order: note.order }));

      const supabaseUpdates = renumberedNotes
        .filter((note) => note.source === "supabase")
        .map((note) => ({ id: note.id, order: note.order }));

      const updates = [];

      for (const update of redisUpdates) {
        updates.push(
          noteOperation("redis", {
            operation: "updateOrder",
            userId: redisUserId,
            noteId: update.id,
            order: update.order,
          }),
        );
      }

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

  const refreshSingleNote = useCallback(
    async (noteId: string): Promise<CombinedNote | null> => {
      if (!redisUserId) return null;

      try {
        let updatedNote: CombinedNote | null = null;

        const targetNoteFromCurrentState = notes.find(
          (note) => note.id === noteId,
        );
        if (!targetNoteFromCurrentState) return null;

        if (targetNoteFromCurrentState.source === "redis") {
          const result = await noteOperation("redis", {
            operation: "getAll",
            userId: redisUserId,
          });

          if (result.success && result.notes) {
            const redisNote = result.notes.find((note) => note.id === noteId);
            if (redisNote) {
              updatedNote = redisToCombi(redisNote);
            }
          }
        } else if (targetNoteFromCurrentState.source === "supabase") {
          const result = await getSupabaseNotesByUserId();
          if (result.success && result.notes) {
            updatedNote =
              result.notes.find((note) => note.id === noteId) || null;
          }
        }

        if (updatedNote) {
          setNotes((prevNotes) => {
            const updatedNotes = prevNotes.map((note) =>
              note.id === noteId ? updatedNote : note,
            );
            return sortNotes(updatedNotes);
          });

          markUpdated();
          return updatedNote;
        }
      } catch (error) {
        console.error("Failed to refresh single note:", error);
      }

      return null;
    },
    [redisUserId, sortNotes, markUpdated],
  );

  // Effects
  useEffect(() => {
    isMounted.current = true;

    const localRedisUserId = getUserId();
    setRedisUserId(localRedisUserId);

    supabase.auth.getUser().then(({ data }) => {
      setIsAuthenticated(!!data.user);
      authCheckedRef.current = true;
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
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

  useEffect(() => {
    if (hasInitialisedRef.current) return;
    if (!redisUserId) return;
    if (!authCheckedRef.current) return;

    const initialiseNotes = async () => {
      try {
        const [redisNotes, supabaseNotes] = await Promise.all([
          noteOperation("redis", {
            operation: "getAll",
            userId: redisUserId,
          }).then((result) =>
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

        if (allNotes.length === 0) {
          console.log("No notes found - creating default note");
          const defaultNoteSource: NoteSource = isAuthenticated
            ? "supabase"
            : "redis";
          const noteNumber = await incrementGlobalNoteCount();

          const newNoteInput: CreateNoteInput = {
            id: generateNoteId([]),
            title: `Just Noted #${noteNumber}`,
            content: "",
          };

          const newNote = createNote(newNoteInput, defaultNoteSource);

          if (defaultNoteSource === "redis") {
            await noteOperation("redis", {
              operation: "create",
              userId: redisUserId,
              note: combiToRedis(newNote),
            });
          } else {
            await createSupabaseNote(newNote);
          }

          allNotes = [newNote];
        }

        if (allNotes.length > 0) {
          localStorage.setItem(HAS_INITIALISED_KEY, "true");
        }

        setNotes(sortNotes(normaliseOrdering(allNotes)));
        hasInitialisedRef.current = true;
      } catch (error) {
        console.error("Failed to initialise notes:", error);
      } finally {
        setIsLoading(false);
        isInitialLoad.current = false;
      }
    };

    initialiseNotes();
  }, [isAuthenticated, redisUserId, sortNotes, normaliseOrdering]);

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
    registerNoteFlush,
    unregisterNoteFlush,
    refreshSingleNote,
  };
}
