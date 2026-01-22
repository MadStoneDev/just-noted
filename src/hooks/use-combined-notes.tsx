"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import {
  USER_NOTE_COUNT_KEY,
  HAS_INITIALISED_KEY,
  INIT_TIMEOUT,
  ACTIVITY_TIMEOUT,
  REFRESH_INTERVAL,
} from "@/constants/app";

export interface UseCombinedNotesReturn {
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
  getNotePositionInfo: (noteId: string) => any;
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
  const [lastUpdateTimestamp, setLastUpdateTimestamp] = useState(Date.now());

  // Refs
  const supabase = createClient();
  const isMounted = useRef(true);
  const hasInitialisedRef = useRef(false);
  const animationTimeout = useRef<NodeJS.Timeout | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const noteFlushFunctionsRef = useRef<Map<string, () => void>>(new Map());
  const initialisationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedServerUpdates = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const redisUserIdRef = useRef<string | null>(null);
  const isAuthenticatedRef = useRef(false);
  const transferLockRef = useRef<Set<string>>(new Set());

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
      const handleOrderZero = (a: CombinedNote, b: CombinedNote): number => {
        if (a.order === 0 && b.order !== 0) return -1;
        if (a.order !== 0 && b.order === 0) return 1;
        if (a.order === 0 && b.order === 0) return b.updatedAt - a.updatedAt;
        return 0;
      };

      const handlePinStatus = (a: CombinedNote, b: CombinedNote): number => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return 0;
      };

      const handleOrderNumber = (a: CombinedNote, b: CombinedNote): number => {
        if (a.order > 0 && b.order <= 0) return -1;
        if (a.order <= 0 && b.order > 0) return 1;
        if (a.order > 0 && b.order > 0) return a.order - b.order;
        return b.updatedAt - a.updatedAt;
      };

      return [...notesToSort].sort((a, b) => {
        const orderZeroResult = handleOrderZero(a, b);
        if (orderZeroResult !== 0) return orderZeroResult;

        const pinResult = handlePinStatus(a, b);
        if (pinResult !== 0) return pinResult;

        return handleOrderNumber(a, b);
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

      return finalOrder.map((note, index) => ({ ...note, order: index + 1 }));
    },
    [],
  );

  // Data Loading
  const loadNotesFromRedis = useCallback(async (): Promise<CombinedNote[]> => {
    const userId = redisUserIdRef.current;
    if (!userId) return [];

    try {
      const result = await noteOperation("redis", {
        operation: "getAll",
        userId,
      });
      if (result.success && result.notes) {
        return result.notes.map(redisToCombi);
      }
    } catch (error) {
      console.error("Failed to load Redis notes:", error);
    }
    return [];
  }, []);

  const loadNotesFromSupabase = useCallback(async (): Promise<
    CombinedNote[]
  > => {
    const authenticated = isAuthenticatedRef.current;
    if (!authenticated) return [];

    try {
      const result = await getSupabaseNotesByUserId();
      if (result.success && result.notes) {
        return result.notes;
      }
    } catch (error) {
      console.error("Failed to load Supabase notes:", error);
    }
    return [];
  }, []);

  const refreshNotes = useCallback(async () => {
    const userId = redisUserIdRef.current;
    if (!userId || !isMounted.current) return;

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

  const saveNoteToStorage = useCallback(async (note: CombinedNote) => {
    const userId = redisUserIdRef.current;
    const authenticated = isAuthenticatedRef.current;

    if (note.source === "redis" && userId) {
      const redisNote = combiToRedis(note);
      return noteOperation("redis", {
        operation: "create",
        userId,
        note: redisNote,
      });
    } else if (note.source === "supabase" && authenticated) {
      return createSupabaseNote(note);
    }
    throw new Error(`Cannot save to ${note.source} storage`);
  }, []);

  const getNextNoteNumber = useCallback(() => {
    const count =
      parseInt(localStorage.getItem(USER_NOTE_COUNT_KEY) || "0") + 1;
    localStorage.setItem(USER_NOTE_COUNT_KEY, count.toString());
    return count;
  }, []);

  // Public API Functions
  const addNote = useCallback(() => {
    const userId = redisUserIdRef.current;
    const authenticated = isAuthenticatedRef.current;

    if (animating || !userId) return;

    setAnimating(true);
    const noteSource: NoteSource = authenticated ? "supabase" : "redis";

    if (!localStorage.getItem(HAS_INITIALISED_KEY)) {
      localStorage.setItem(HAS_INITIALISED_KEY, "true");
    }

    const noteNumber = getNextNoteNumber();

    (async () => {
      try {
        const newNoteInput: CreateNoteInput = {
          id: generateNoteId(notes.map((n) => n.id)),
          title: `New Note #${noteNumber}`,
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
          throw new Error("Failed to save note");
        }
      } catch (error) {
        handleError("create note", error, "creation");
      } finally {
        setAnimating(false);
        setTimeout(() => setNewNoteId(null), 600);
      }
    })();
  }, [
    animating,
    notes,
    sortNotes,
    saveNoteToStorage,
    markUpdated,
    handleError,
    refreshNotes,
    getNextNoteNumber,
  ]);

  const updatePinStatus = useCallback(
    async (noteId: string, isPinned: boolean) => {
      const userId = redisUserIdRef.current;
      if (!userId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      updateNoteInState(noteId, { isPinned });

      try {
        if (targetNote.source === "redis") {
          await noteOperation("redis", {
            operation: "updatePin",
            userId,
            noteId,
            isPinned,
          });
        } else {
          await updateSupabaseNotePinStatus(noteId, isPinned);
        }
        markUpdated();
      } catch (error) {
        handleError("update pin status", error);
      }
    },
    [notes, updateNoteInState, markUpdated, handleError],
  );

  const updatePrivacyStatus = useCallback(
    async (noteId: string, isPrivate: boolean) => {
      const userId = redisUserIdRef.current;
      if (!userId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      updateNoteInState(noteId, { isPrivate });

      try {
        if (targetNote.source === "redis") {
          await noteOperation("redis", {
            operation: "updatePrivacy",
            userId,
            noteId,
            isPrivate,
          });
        } else {
          await updateSupabaseNotePrivacyStatus(noteId, isPrivate);
        }
        markUpdated();
      } catch (error) {
        handleError("update privacy status", error);
      }
    },
    [notes, updateNoteInState, markUpdated, handleError],
  );

  const updateCollapsedStatus = useCallback(
    async (noteId: string, isCollapsed: boolean) => {
      const userId = redisUserIdRef.current;
      if (!userId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      updateNoteInState(noteId, { isCollapsed });
      markUpdated();

      const existingTimeout = debouncedServerUpdates.current.get(noteId);
      if (existingTimeout) clearTimeout(existingTimeout);

      debouncedServerUpdates.current.set(
        noteId,
        setTimeout(async () => {
          try {
            if (targetNote.source === "redis") {
              await noteOperation("redis", {
                operation: "updateCollapsed",
                userId,
                noteId,
                isCollapsed,
              });
            } else {
              await updateSupabaseNoteCollapsedStatus(noteId, isCollapsed);
            }
          } catch (error) {
            handleError("update collapsed status", error);
          } finally {
            debouncedServerUpdates.current.delete(noteId);
          }
        }, 500),
      );
    },
    [notes, updateNoteInState, markUpdated, handleError],
  );

  const reorderNote = useCallback(
    async (noteId: string, direction: "up" | "down") => {
      const userId = redisUserIdRef.current;
      if (!userId || isReorderingInProgress) return;

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
              userId,
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
              userId,
              noteId: swapNote.id,
              order: targetOrder,
            }),
          );
        } else {
          updates.push(updateSupabaseNoteOrder(swapNote.id, targetOrder));
        }

        await Promise.all(updates);
        markUpdated();
      } catch (error) {
        handleError("reorder note", error);
      } finally {
        setIsReorderingInProgress(false);
      }
    },
    [notes, isReorderingInProgress, sortNotes, markUpdated, handleError],
  );

  const deleteNote = useCallback(
    async (noteId: string) => {
      const userId = redisUserIdRef.current;
      if (!userId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      if (notes.length === 1) {
        alert(
          "You must have at least one note. Create a new note before deleting this one.",
        );
        return;
      }

      setNotes((prevNotes) => prevNotes.filter((note) => note.id !== noteId));

      try {
        if (targetNote.source === "redis") {
          await noteOperation("redis", { operation: "delete", userId, noteId });
        } else {
          await deleteSupabaseNote(noteId);
        }
        markUpdated();
      } catch (error) {
        handleError("delete note", error);
        await refreshNotes();
      }
    },
    [notes, markUpdated, handleError, refreshNotes],
  );

  const transferNote = useCallback(
    async (noteId: string, targetSource: NoteSource) => {
      const userId = redisUserIdRef.current;
      const authenticated = isAuthenticatedRef.current;

      if (!userId) return;

      // Check if this note is already being transferred
      if (transferLockRef.current.has(noteId)) {
        console.warn("Transfer already in progress for this note");
        return;
      }

      const localNote = notes.find((note) => note.id === noteId);
      if (!localNote || localNote.source === targetSource) return;

      if (targetSource === "supabase" && !authenticated) {
        alert("You must be signed in to save notes to the cloud.");
        return;
      }

      // Lock this transfer
      transferLockRef.current.add(noteId);
      setTransferringNoteId(noteId);

      try {
        let sourceNote: CombinedNote | null = null;

        if (localNote.source === "redis") {
          const result = await noteOperation("redis", {
            operation: "getAll",
            userId,
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
            userId,
            note: redisNote,
          });
        } else {
          createResult = await createSupabaseNote(noteToTransfer);
        }

        if (!createResult?.success) {
          throw new Error("Failed to create note in target storage");
        }

        let deleteResult;
        if (sourceNote.source === "redis") {
          deleteResult = await noteOperation("redis", {
            operation: "delete",
            userId,
            noteId,
          });
        } else {
          deleteResult = await deleteSupabaseNote(noteId);
        }

        if (!deleteResult?.success) {
          console.error("Failed to delete source note");
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
        // CRITICAL FIX: Remove the lock after transfer completes
        transferLockRef.current.delete(noteId);
      }
    },
    [notes, sortNotes, markUpdated, handleError, refreshNotes],
  );

  const syncAndRenumberNotes = useCallback(async () => {
    const userId = redisUserIdRef.current;
    if (!userId) return;

    setIsReorderingInProgress(true);

    try {
      // Flush all pending saves with better error handling
      const flushPromises: Promise<void>[] = [];
      noteFlushFunctionsRef.current.forEach((flushFn, noteId) => {
        flushPromises.push(
          new Promise<void>((resolve) => {
            try {
              flushFn();
              setTimeout(resolve, 100);
            } catch (error) {
              console.error(`Flush failed for note ${noteId}:`, error);
              resolve(); // Continue even if one flush fails
            }
          }),
        );
      });

      if (flushPromises.length > 0) {
        await Promise.allSettled(flushPromises);
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

      if (redisUpdates.length > 0) {
        updates.push(
          noteOperation("redis", {
            operation: "batchUpdateOrders",
            userId,
            updates: redisUpdates,
          }),
        );
      }

      if (supabaseUpdates.length > 0) {
        updates.push(batchUpdateNoteOrders(supabaseUpdates));
      }

      const results = await Promise.allSettled(updates);
      const failures = results.filter((r) => r.status === "rejected");

      if (failures.length > 0) {
        console.warn(`${failures.length} sync operations failed`);
      }

      markUpdated();
    } catch (error) {
      handleError("sync and renumber notes", error);
    } finally {
      setIsReorderingInProgress(false);
    }
  }, [notes, normaliseOrdering, sortNotes, markUpdated, handleError]);

  const notePositions = useMemo(() => {
    const pinnedNotes = notes.filter((note) => note.isPinned);
    const unpinnedNotes = notes.filter((note) => !note.isPinned);

    const positions = new Map();

    pinnedNotes.forEach((note, index) => {
      positions.set(note.id, {
        isFirstPinned: index === 0,
        isLastPinned: index === pinnedNotes.length - 1,
        isFirstUnpinned: false,
        isLastUnpinned: false,
      });
    });

    unpinnedNotes.forEach((note, index) => {
      positions.set(note.id, {
        isFirstPinned: false,
        isLastPinned: false,
        isFirstUnpinned: index === 0,
        isLastUnpinned: index === unpinnedNotes.length - 1,
      });
    });

    return positions;
  }, [notes]);

  const getNotePositionInfo = useCallback(
    (noteId: string) =>
      notePositions.get(noteId) || {
        isFirstPinned: false,
        isLastPinned: false,
        isFirstUnpinned: false,
        isLastUnpinned: false,
      },
    [notePositions],
  );

  const refreshSingleNote = useCallback(
    async (noteId: string): Promise<CombinedNote | null> => {
      const userId = redisUserIdRef.current;
      if (!userId) return null;

      try {
        let updatedNote: CombinedNote | null = null;

        const targetNoteFromCurrentState = notes.find(
          (note) => note.id === noteId,
        );
        if (!targetNoteFromCurrentState) return null;

        if (targetNoteFromCurrentState.source === "redis") {
          const result = await noteOperation("redis", {
            operation: "getAll",
            userId,
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
            // CHANGED: Update the note but DON'T resort - preserve order
            const updatedNotes = prevNotes.map((note) =>
              note.id === noteId ? updatedNote : note,
            );
            // Only re-sort if pin status changed, otherwise keep current order
            if (targetNoteFromCurrentState.isPinned !== updatedNote.isPinned) {
              return sortNotes(updatedNotes);
            }
            return updatedNotes;
          });

          markUpdated();
          return updatedNote;
        }
      } catch (error) {
        console.error("Failed to refresh single note:", error);
      }

      return null;
    },
    [notes, sortNotes, markUpdated],
  );

  // Initialisation
  useEffect(() => {
    if (!isMounted.current || hasInitialisedRef.current) return;

    initialisationTimeoutRef.current = setTimeout(() => {
      if (!hasInitialisedRef.current) {
        console.error("⚠️ Initialisation timeout - forcing completion");
        setIsLoading(false);
        hasInitialisedRef.current = true;
      }
    }, INIT_TIMEOUT);

    const initialise = async () => {
      try {
        const userId = getUserId();
        setRedisUserId(userId);
        redisUserIdRef.current = userId;

        if (!userId) {
          throw new Error("Failed to get Redis user ID");
        }

        const { data: authData } = await supabase.auth.getUser();
        const authenticated = !!authData?.user;
        setIsAuthenticated(authenticated);
        isAuthenticatedRef.current = authenticated;

        const [redisResult, supabaseResult] = await Promise.allSettled([
          noteOperation("redis", { operation: "getAll", userId }),
          authenticated
            ? getSupabaseNotesByUserId()
            : Promise.resolve({ success: true, notes: [] }),
        ]);

        const redisNotes =
          redisResult.status === "fulfilled" &&
          redisResult.value.success &&
          redisResult.value.notes
            ? redisResult.value.notes.map(redisToCombi)
            : [];

        const supabaseNotes =
          supabaseResult.status === "fulfilled" &&
          supabaseResult.value.success &&
          supabaseResult.value.notes
            ? supabaseResult.value.notes
            : [];

        let allNotes = [...redisNotes, ...supabaseNotes];

        if (allNotes.length === 0) {
          const defaultNoteSource: NoteSource = authenticated
            ? "supabase"
            : "redis";
          const noteNumber =
            parseInt(localStorage.getItem(USER_NOTE_COUNT_KEY) || "0") + 1;
          localStorage.setItem(USER_NOTE_COUNT_KEY, noteNumber.toString());

          const newNoteInput: CreateNoteInput = {
            id: generateNoteId([]),
            title: `New Note #${noteNumber}`,
            content: "",
          };

          const newNote = createNote(newNoteInput, defaultNoteSource);

          if (defaultNoteSource === "redis") {
            await noteOperation("redis", {
              operation: "create",
              userId,
              note: combiToRedis(newNote),
            });
          } else {
            await createSupabaseNote(newNote);
          }

          allNotes = [newNote];
          localStorage.setItem(HAS_INITIALISED_KEY, "true");
        } else {
          if (!localStorage.getItem(HAS_INITIALISED_KEY)) {
            localStorage.setItem(HAS_INITIALISED_KEY, "true");
          }
        }

        const normalizedNotes = normaliseOrdering(allNotes);
        const sortedNotes = sortNotes(normalizedNotes);

        setNotes(sortedNotes);
        hasInitialisedRef.current = true;
      } catch (error) {
        console.error("Initialisation error:", error);
        hasInitialisedRef.current = true;
      } finally {
        setIsLoading(false);

        if (initialisationTimeoutRef.current) {
          clearTimeout(initialisationTimeoutRef.current);
          initialisationTimeoutRef.current = null;
        }
      }
    };

    initialise();
    updateLastAccess();
  }, []);

  const updateLastAccess = useCallback(async () => {
    const userId = redisUserIdRef.current;
    if (!userId) return;

    try {
      await fetch("/api/user-activity", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
    } catch (error) {
      console.error("Failed to update last access:", error);
    }
  }, []);

  // Auth change listener
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_, session) => {
        const wasAuthenticated = isAuthenticatedRef.current;
        const nowAuthenticated = !!session?.user;

        setIsAuthenticated(nowAuthenticated);
        isAuthenticatedRef.current = nowAuthenticated;

        if (
          hasInitialisedRef.current &&
          wasAuthenticated !== nowAuthenticated
        ) {
          await refreshNotes();
        }
      },
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [refreshNotes]);

  // Refresh interval - only refresh when user is not actively editing
  useEffect(() => {
    if (!hasInitialisedRef.current) return;

    const interval = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastUpdateTimestamp;

      // Check if any note is being actively edited before refreshing
      // This prevents the cursor from jumping during active editing sessions
      const hasActiveEdits = noteFlushFunctionsRef.current.size > 0;

      if (timeSinceLastUpdate > ACTIVITY_TIMEOUT && !hasActiveEdits) {
        refreshNotes();
      }

      updateLastAccess();
    }, REFRESH_INTERVAL);

    refreshIntervalRef.current = interval;
    return () => clearInterval(interval);
  }, [lastUpdateTimestamp, refreshNotes, updateLastAccess]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;

      if (animationTimeout.current) clearTimeout(animationTimeout.current);
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      if (initialisationTimeoutRef.current)
        clearTimeout(initialisationTimeoutRef.current);

      // Clear all debounced server updates
      debouncedServerUpdates.current.forEach((timeout) =>
        clearTimeout(timeout),
      );
      debouncedServerUpdates.current.clear();
    };
  }, []);

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
