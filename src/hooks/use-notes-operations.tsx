// src/hooks/use-notes-operations.tsx
"use client";

import { useCallback, useRef, useEffect } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { sortNotes, normaliseOrdering } from "@/utils/notes-utils";
import { noteOperation } from "@/app/actions/notes";
import {
  updateNotePinStatus as updateSupabaseNotePinStatus,
  updateNotePrivacyStatus as updateSupabaseNotePrivacyStatus,
  updateNoteCollapsedStatus as updateSupabaseNoteCollapsedStatus,
  deleteNote as deleteSupabaseNote,
  updateSupabaseNoteOrder,
  batchUpdateNoteOrders,
  updateNote as updateSupabaseNote,
  updateNoteTitle as updateSupabaseNoteTitle,
  createNote as createSupabaseNote,
  getNotesByUserId as getSupabaseNotesByUserId,
} from "@/app/actions/supabaseActions";
import {
  NoteSource,
  CreateNoteInput,
  createNote,
  combiToRedis,
  cloneNote,
  validateContentPreservation,
  redisToCombi,
  CombinedNote,
} from "@/types/combined-notes";
import { generateNoteId } from "@/utils/general/notes";
import { saveNoteToLocal, saveAllNotesToLocal, deleteLocalNote } from "@/utils/notes-idb-cache";
import { enqueue } from "@/utils/offline-queue";

export interface NotesOperations {
  addNote: (templateContent?: string, templateTitle?: string) => Promise<void>;
  updatePinStatus: (noteId: string, isPinned: boolean) => Promise<void>;
  updatePrivacyStatus: (noteId: string, isPrivate: boolean) => Promise<void>;
  updateCollapsedStatus: (noteId: string, isCollapsed: boolean) => void;
  reorderNote: (noteId: string, direction: "up" | "down") => Promise<void>;
  transferNote: (noteId: string, targetSource: NoteSource) => Promise<void>;
  syncAndRenumberNotes: () => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  restoreNote: () => Promise<void>;
  saveNoteContent: (
    noteId: string,
    content: string,
    goal: number,
    goalType: "" | "words" | "characters",
  ) => Promise<{ success: boolean }>;
  saveNoteTitle: (noteId: string, title: string) => Promise<{ success: boolean }>;
  refreshSingleNote: (noteId: string) => Promise<CombinedNote | null>;
  transferringNoteId: string | null;
}
import { USER_NOTE_COUNT_KEY, HAS_INITIALISED_KEY } from "@/constants/app";

export function useNotesOperations(
  userId: string | null,
  isAuthenticated: boolean,
  refreshNotes: () => Promise<void>,
  noteFlushFunctions: React.MutableRefObject<Map<string, () => void>>,
) {
  const {
    notes,
    optimisticUpdateNote,
    optimisticAddNote,
    optimisticDeleteNote,
    optimisticReorderNotes,
    setAnimating,
    setNewNoteId,
    setReordering,
    setTransferring,
    transferringNoteId,
    setCreationError,
    setTransferError,
    setSaving,
  } = useNotesStore();

  const transferLockRef = useRef<Set<string>>(new Set());
  const newNoteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Add Note (with optional template content)
  const addNote = useCallback(async (templateContent?: string, templateTitle?: string) => {
    if (!userId) return;

    const noteSource: NoteSource = isAuthenticated ? "supabase" : "redis";
    const noteNumber =
      parseInt(localStorage.getItem(USER_NOTE_COUNT_KEY) || "0") + 1;
    localStorage.setItem(USER_NOTE_COUNT_KEY, noteNumber.toString());

    if (!localStorage.getItem(HAS_INITIALISED_KEY)) {
      localStorage.setItem(HAS_INITIALISED_KEY, "true");
    }

    const newNoteInput: CreateNoteInput = {
      id: generateNoteId(notes.map((n) => n.id)),
      title: templateTitle || `New Note #${noteNumber}`,
      content: templateContent || "",
    };

    const newNote = createNote(newNoteInput, noteSource);
    newNote.order = 0; // Mark as new with order 0

    // Set author immediately for authenticated users
    if (isAuthenticated && userId) {
      newNote.author = userId;
    }

    // Optimistic update - note will be at the top
    setAnimating(true);
    setNewNoteId(newNote.id);

    // Add note and immediately re-sort with newNoteId priority
    const updatedNotes = [newNote, ...notes];
    const sortedNotes = sortNotes(updatedNotes, newNote.id);
    optimisticReorderNotes(sortedNotes);

    // Persist to IDB cache immediately
    saveNoteToLocal(newNote).catch(() => {});

    // Background save
    try {
      let result;
      if (noteSource === "redis") {
        result = await noteOperation("redis", {
          operation: "create",
          userId,
          note: combiToRedis(newNote),
        });
      } else {
        result = await createSupabaseNote(newNote);

        if (result.success && result.note) {
          // Update with server response but keep it at the top
          optimisticUpdateNote(newNote.id, result.note);
        }
      }

      if (!result.success) {
        throw new Error("Failed to save note");
      }

      // After successful save, trigger a re-sort to move below pinned notes
      // But keep the visual feedback for a moment
      if (newNoteTimeoutRef.current) {
        clearTimeout(newNoteTimeoutRef.current);
      }
      newNoteTimeoutRef.current = setTimeout(() => {
        setNewNoteId(null); // This will trigger re-sort on next render
        newNoteTimeoutRef.current = null;
      }, 2000); // Keep "new note" indicator for 2 seconds
    } catch (error) {
      console.error("Failed to create note, queuing for retry:", error);
      enqueue({
        type: "create",
        noteId: newNote.id,
        source: noteSource,
        userId,
        note: noteSource === "redis" ? combiToRedis(newNote) : newNote,
      });
    } finally {
      setAnimating(false);
    }
  }, [
    userId,
    isAuthenticated,
    notes,
    optimisticUpdateNote,
    optimisticReorderNotes,
    setAnimating,
    setNewNoteId,
  ]);

  // Update Pin Status
  const updatePinStatus = useCallback(
    async (noteId: string, isPinned: boolean) => {
      if (!userId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      // Optimistic update
      optimisticUpdateNote(noteId, { isPinned });

      // Persist to IDB cache
      saveNoteToLocal({ ...targetNote, isPinned, updatedAt: Date.now() }).catch(() => {});

      // If pin status changed, re-sort
      const updatedNotes = notes.map((note) =>
        note.id === noteId ? { ...note, isPinned } : note,
      );
      const sortedNotes = sortNotes(
        updatedNotes,
        useNotesStore.getState().newNoteId,
      );
      optimisticReorderNotes(sortedNotes);

      // Background save
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
      } catch (error) {
        console.error("Failed to update pin status, queuing for retry:", error);
        enqueue({
          type: "updatePin",
          noteId,
          source: targetNote.source,
          userId,
          isPinned,
        });
      }
    },
    [userId, notes, optimisticUpdateNote, optimisticReorderNotes],
  );

  // Update Privacy Status
  const updatePrivacyStatus = useCallback(
    async (noteId: string, isPrivate: boolean) => {
      if (!userId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      // Optimistic update
      optimisticUpdateNote(noteId, { isPrivate });

      // Persist to IDB cache
      saveNoteToLocal({ ...targetNote, isPrivate, updatedAt: Date.now() }).catch(() => {});

      // Background save
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
      } catch (error) {
        console.error("Failed to update privacy status, queuing for retry:", error);
        enqueue({
          type: "updatePrivacy",
          noteId,
          source: targetNote.source,
          userId,
          isPrivate,
        });
      }
    },
    [userId, notes, optimisticUpdateNote],
  );

  // Update Collapsed Status
  const updateCollapsedStatus = useCallback(
    async (noteId: string, isCollapsed: boolean) => {
      if (!userId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      // Optimistic update
      optimisticUpdateNote(noteId, { isCollapsed });

      // Persist to IDB cache
      saveNoteToLocal({ ...targetNote, isCollapsed, updatedAt: Date.now() }).catch(() => {});

      // Clear existing timeout
      const existingTimeout = debouncedTimeouts.current.get(noteId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Background save with debounce
      const timeoutId = setTimeout(async () => {
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
          console.error("Failed to update collapsed status, queuing for retry:", error);
          enqueue({
            type: "updateCollapsed",
            noteId,
            source: targetNote.source,
            userId,
            isCollapsed,
          });
        } finally {
          debouncedTimeouts.current.delete(noteId);
        }
      }, 500);

      debouncedTimeouts.current.set(noteId, timeoutId);
    },
    [userId, notes, optimisticUpdateNote],
  );

  // Reorder Note
  const reorderNote = useCallback(
    async (noteId: string, direction: "up" | "down") => {
      if (!userId) return;

      setReordering(true);

      try {
        const targetNote = notes.find((note) => note.id === noteId);
        if (!targetNote) return;

        // Get notes with same pin status
        const sameStatusNotes = notes.filter(
          (note) => note.isPinned === targetNote.isPinned,
        );
        const sortedNotes = sortNotes(sameStatusNotes, null);

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

        // Optimistic update
        const updatedNotes = notes.map((note) => {
          if (note.id === targetNote.id) return { ...note, order: swapOrder };
          if (note.id === swapNote.id) return { ...note, order: targetOrder };
          return note;
        });
        optimisticReorderNotes(
          sortNotes(updatedNotes, useNotesStore.getState().newNoteId),
        );

        // Background save
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
      } catch (error) {
        console.error("Failed to reorder note:", error);
        await refreshNotes();
      } finally {
        setReordering(false);
      }
    },
    [userId, notes, optimisticReorderNotes, setReordering, refreshNotes],
  );

  // Transfer Note
  const transferNote = useCallback(
    async (noteId: string, targetSource: NoteSource) => {
      if (!userId) return;

      // Check if this note is already being transferred
      if (transferLockRef.current.has(noteId)) {
        console.warn("Transfer already in progress for this note");
        return;
      }

      const localNote = notes.find((note) => note.id === noteId);
      if (!localNote || localNote.source === targetSource) return;

      if (targetSource === "supabase" && !isAuthenticated) {
        console.warn("Transfer blocked: user not authenticated for cloud save");
        return;
      }

      // Lock this transfer with 30-second fallback timeout
      transferLockRef.current.add(noteId);
      setTransferring(noteId);
      const transferTimeout = setTimeout(() => {
        transferLockRef.current.delete(noteId);
        setTransferring(null);
      }, 30000);

      try {
        // Clone the note with new source and ID
        const noteToTransfer = cloneNote(localNote);
        noteToTransfer.id = generateNoteId(notes.map((n) => n.id));
        noteToTransfer.source = targetSource;

        if (!validateContentPreservation(localNote, noteToTransfer)) {
          console.error("Content lost during cloning, attempting recovery");
          noteToTransfer.content = localNote.content;
        }

        // Optimistic update - add new note and remove old one
        optimisticAddNote(noteToTransfer);
        optimisticDeleteNote(noteId);

        // Background save - create in new location
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

        // Background save - delete from old location
        let deleteResult;
        if (localNote.source === "redis") {
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

        // Refresh to ensure consistency
        await refreshNotes();
      } catch (error) {
        console.error("Transfer failed:", error);
        setTransferError(true); // ADD THIS
        await refreshNotes();
      } finally {
        clearTimeout(transferTimeout);
        setTransferring(null);
        transferLockRef.current.delete(noteId);
      }
    },
    [
      userId,
      isAuthenticated,
      notes,
      optimisticAddNote,
      optimisticDeleteNote,
      setTransferring,
      setTransferError,
      refreshNotes,
    ],
  );

  // Sync and Renumber Notes
  const syncAndRenumberNotes = useCallback(async () => {
    if (!userId) return;

    setReordering(true);

    try {
      // Flush all pending saves
      const flushPromises: Promise<void>[] = [];
      noteFlushFunctions.current.forEach((flushFn, noteId) => {
        flushPromises.push(
          new Promise<void>((resolve) => {
            try {
              flushFn();
              setTimeout(resolve, 100);
            } catch (error) {
              console.error(`Flush failed for note ${noteId}:`, error);
              resolve();
            }
          }),
        );
      });

      if (flushPromises.length > 0) {
        await Promise.allSettled(flushPromises);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Normalize ordering
      const renumberedNotes = normaliseOrdering(notes);
      const sortedNotes = sortNotes(renumberedNotes);

      // Optimistic update
      optimisticReorderNotes(sortedNotes);

      // Batch update backend
      const redisUpdates = sortedNotes
        .filter((note) => note.source === "redis")
        .map((note) => ({ id: note.id, order: note.order }));

      const supabaseUpdates = sortedNotes
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
    } catch (error) {
      console.error("Failed to sync and renumber notes:", error);
      await refreshNotes();
    } finally {
      setReordering(false);
    }
  }, [
    userId,
    notes,
    optimisticReorderNotes,
    setReordering,
    noteFlushFunctions,
    refreshNotes,
  ]);

  // Delete Note with Undo support
  const deleteNote = useCallback(
    async (noteId: string) => {
      if (!userId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      if (notes.length === 1) {
        return;
      }

      const { setRecentlyDeleted, clearRecentlyDeleted } = useNotesStore.getState();

      // Optimistic update
      optimisticDeleteNote(noteId);

      // Remove from IDB cache
      deleteLocalNote(noteId).catch(() => {});

      // Set up undo - will auto-clear after 10 seconds
      const timeoutId = setTimeout(async () => {
        // Actually delete from backend after timeout
        try {
          if (targetNote.source === "redis") {
            await noteOperation("redis", { operation: "delete", userId, noteId });
          } else {
            await deleteSupabaseNote(noteId);
          }
        } catch (error) {
          console.error("Failed to delete note, queuing for retry:", error);
          enqueue({
            type: "delete",
            noteId,
            source: targetNote.source,
            userId,
          });
        }
        clearRecentlyDeleted();
      }, 10000);

      setRecentlyDeleted(targetNote, timeoutId);
    },
    [userId, notes, optimisticDeleteNote],
  );

  // Restore deleted note (called when undo is clicked)
  const restoreNote = useCallback(async () => {
    const { recentlyDeleted, restoreDeletedNote: restoreFromStore } = useNotesStore.getState();
    if (!recentlyDeleted || !userId) return;

    const restoredNote = restoreFromStore();
    if (!restoredNote) return;

    // Re-save to backend
    try {
      if (restoredNote.source === "redis") {
        await noteOperation("redis", {
          operation: "create",
          userId,
          note: combiToRedis(restoredNote),
        });
      } else {
        await createSupabaseNote(restoredNote);
      }
    } catch (error) {
      console.error("Failed to restore note:", error);
      await refreshNotes();
    }
  }, [userId, refreshNotes]);

  // Save Note Content
  const saveNoteContent = useCallback(
    async (
      noteId: string,
      content: string,
      goal: number,
      goalType: "" | "words" | "characters",
    ) => {
      if (!userId) return { success: false };

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) {
        console.error("❌ Note not found for saving:", noteId);
        return { success: false };
      }

      // Get store methods
      const { setSaving, setEditing, setSaveError } = useNotesStore.getState();

      // Mark as saving (and stop editing since we're saving now)
      setSaving(noteId, true);
      setEditing(noteId, false);

      // Optimistic update
      optimisticUpdateNote(noteId, { content, goal, goal_type: goalType });

      // Persist to IDB cache immediately
      saveNoteToLocal({ ...targetNote, content, goal, goal_type: goalType, updatedAt: Date.now() }).catch(() => {});

      // Background save
      try {
        let result;
        if (targetNote.source === "redis") {
          result = await noteOperation("redis", {
            operation: "update",
            userId,
            noteId,
            content,
            goal,
            goalType,
          });
        } else {
          result = await updateSupabaseNote(noteId, content, goal, goalType);
        }

        // Clear error on success, set on failure
        if (result.success) {
          setSaveError(noteId, false);
        } else {
          setSaveError(noteId, true);
        }

        return result;
      } catch (error) {
        console.error("Failed to save note content, queuing for retry:", error);
        setSaveError(noteId, true);
        enqueue({
          type: "update",
          noteId,
          source: targetNote.source,
          userId,
          content,
          goal,
          goalType,
        });
        return { success: false };
      } finally {
        // Mark as done saving
        setSaving(noteId, false);
      }
    },
    [userId, notes, optimisticUpdateNote],
  );

  // Save Note Title
  const saveNoteTitle = useCallback(
    async (noteId: string, title: string) => {
      if (!userId) return { success: false };

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return { success: false };

      // Mark as saving
      setSaving(noteId, true);

      // Optimistic update
      optimisticUpdateNote(noteId, { title });

      // Persist to IDB cache
      saveNoteToLocal({ ...targetNote, title, updatedAt: Date.now() }).catch(() => {});

      // Background save
      try {
        let result;
        if (targetNote.source === "redis") {
          result = await noteOperation("redis", {
            operation: "updateTitle",
            userId,
            noteId,
            title,
          });
        } else {
          result = await updateSupabaseNoteTitle(noteId, title);
        }

        return result;
      } catch (error) {
        console.error("Failed to save note title, queuing for retry:", error);
        enqueue({
          type: "updateTitle",
          noteId,
          source: targetNote.source,
          userId,
          title,
        });
        return { success: false };
      } finally {
        setSaving(noteId, false);
      }
    },
    [userId, notes, optimisticUpdateNote, setSaving],
  );

  const refreshSingleNote = useCallback(
    async (noteId: string): Promise<CombinedNote | null> => {
      if (!userId) return null;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return null;

      try {
        let updatedNote: CombinedNote | null = null;

        if (targetNote.source === "redis") {
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
        } else {
          const result = await getSupabaseNotesByUserId();
          if (result.success && result.notes) {
            updatedNote =
              result.notes.find((note) => note.id === noteId) || null;
          }
        }

        if (updatedNote) {
          // Only update this specific note
          optimisticUpdateNote(noteId, updatedNote);
          return updatedNote;
        }
      } catch (error) {
        console.error("Failed to refresh single note:", error);
      }

      return null;
    },
    [userId, notes, optimisticUpdateNote],
  );

  useEffect(() => {
    return () => {
      // Clear all pending debounced updates
      debouncedTimeouts.current.forEach((timeout) => clearTimeout(timeout));
      debouncedTimeouts.current.clear();
      // Clear newNote timeout
      if (newNoteTimeoutRef.current) {
        clearTimeout(newNoteTimeoutRef.current);
      }
    };
  }, []);

  return {
    addNote,
    updatePinStatus,
    updatePrivacyStatus,
    updateCollapsedStatus,
    reorderNote,
    transferNote,
    syncAndRenumberNotes,
    deleteNote,
    restoreNote,
    saveNoteContent,
    saveNoteTitle,
    refreshSingleNote,
    transferringNoteId,
  };
}
