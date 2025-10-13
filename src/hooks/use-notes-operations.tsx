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
  generateNoteId,
  redisToCombi,
  CombinedNote,
} from "@/types/combined-notes";
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
  const debouncedTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Add Note
  const addNote = useCallback(async () => {
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
      title: `New Note #${noteNumber}`,
      content: "",
    };

    const newNote = createNote(newNoteInput, noteSource);
    newNote.order = 0;

    // Optimistic update - instant UI
    setAnimating(true);
    setNewNoteId(newNote.id);
    optimisticAddNote(newNote);

    // Background save
    try {
      if (noteSource === "redis") {
        await noteOperation("redis", {
          operation: "create",
          userId,
          note: combiToRedis(newNote),
        });
      } else {
        await createSupabaseNote(newNote);
      }
    } catch (error) {
      console.error("Failed to create note:", error);
      setCreationError(true); // ADD THIS
      // Revert on error
      await refreshNotes();
    } finally {
      setAnimating(false);
      setTimeout(() => setNewNoteId(null), 600);
    }
  }, [
    userId,
    isAuthenticated,
    notes,
    optimisticAddNote,
    setAnimating,
    setNewNoteId,
    setCreationError, // ADD THIS
    refreshNotes,
  ]);

  // Update Pin Status
  const updatePinStatus = useCallback(
    async (noteId: string, isPinned: boolean) => {
      if (!userId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      // Optimistic update
      optimisticUpdateNote(noteId, { isPinned });

      // If pin status changed, re-sort
      const updatedNotes = notes.map((note) =>
        note.id === noteId ? { ...note, isPinned } : note,
      );
      const sortedNotes = sortNotes(updatedNotes);
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
        console.error("Failed to update pin status:", error);
        await refreshNotes();
      }
    },
    [userId, notes, optimisticUpdateNote, optimisticReorderNotes, refreshNotes],
  );

  // Update Privacy Status
  const updatePrivacyStatus = useCallback(
    async (noteId: string, isPrivate: boolean) => {
      if (!userId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      // Optimistic update
      optimisticUpdateNote(noteId, { isPrivate });

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
        console.error("Failed to update privacy status:", error);
        await refreshNotes();
      }
    },
    [userId, notes, optimisticUpdateNote, refreshNotes],
  );

  // Update Collapsed Status
  const updateCollapsedStatus = useCallback(
    async (noteId: string, isCollapsed: boolean) => {
      if (!userId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      // Optimistic update
      optimisticUpdateNote(noteId, { isCollapsed });

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
          console.error("Failed to update collapsed status:", error);
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

        // Optimistic update
        const updatedNotes = notes.map((note) => {
          if (note.id === targetNote.id) return { ...note, order: swapOrder };
          if (note.id === swapNote.id) return { ...note, order: targetOrder };
          return note;
        });
        optimisticReorderNotes(sortNotes(updatedNotes));

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
        alert("You must be signed in to save notes to the cloud.");
        return;
      }

      // Lock this transfer
      transferLockRef.current.add(noteId);
      setTransferring(noteId);

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

  // Delete Note
  const deleteNote = useCallback(
    async (noteId: string) => {
      if (!userId) return;

      const targetNote = notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      if (notes.length === 1) {
        alert(
          "You must have at least one note. Create a new note before deleting this one.",
        );
        return;
      }

      // Optimistic update
      optimisticDeleteNote(noteId);

      // Background save
      try {
        if (targetNote.source === "redis") {
          await noteOperation("redis", { operation: "delete", userId, noteId });
        } else {
          await deleteSupabaseNote(noteId);
        }
      } catch (error) {
        console.error("Failed to delete note:", error);
        await refreshNotes();
      }
    },
    [userId, notes, optimisticDeleteNote, refreshNotes],
  );

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
      if (!targetNote) return { success: false };

      // Get store methods
      const { setSaving, setEditing } = useNotesStore.getState();

      // Mark as saving (and stop editing since we're saving now)
      setSaving(noteId, true);
      setEditing(noteId, false);

      // Optimistic update
      optimisticUpdateNote(noteId, { content, goal, goal_type: goalType });

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

        return result;
      } catch (error) {
        console.error("Failed to save note content:", error);
        // Optionally revert optimistic update on error
        await refreshNotes();
        return { success: false };
      } finally {
        // Mark as done saving
        setSaving(noteId, false);
      }
    },
    [userId, notes, optimisticUpdateNote, refreshNotes],
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
        console.error("Failed to save note title:", error);
        await refreshNotes();
        return { success: false };
      } finally {
        setSaving(noteId, false);
      }
    },
    [userId, notes, optimisticUpdateNote, setSaving, refreshNotes],
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
    saveNoteContent,
    saveNoteTitle,
    refreshSingleNote,
    transferringNoteId,
  };
}
