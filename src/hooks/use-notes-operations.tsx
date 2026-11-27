// src/hooks/use-notes-operations.tsx
"use client";

import { useCallback, useRef, useEffect, useMemo } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { sortNotes, normaliseOrdering, sameNoteContent } from "@/utils/notes-utils";
import { noteOperation } from "@/app/actions/notes";
import { saveVersion } from "@/app/actions/versionActions";
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
  getNoteById as getSupabaseNoteById,
  restoreNote as restoreSupabaseNote,
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
import { withNoteLock, broadcastNoteUpdate, broadcastNoteDeleted, broadcastNotesChanged } from "@/utils/cross-tab";
import { saveNoteToLocal, saveAllNotesToLocal, deleteLocalNote, setLocalNoteVersion, saveLocalEditNow } from "@/utils/notes-idb-cache";
import {
  enqueue,
  dropQueuedOps,
  enqueueContentNow,
  dropSupersededUpdates,
  queueClock,
  deleteAlreadyDone,
} from "@/utils/offline-queue";
import { getActiveSupabaseUser, cloudAccountFor } from "@/utils/offline-queue-guard";
import { editorHandleFor } from "@/utils/note-ownership";
import { markPendingDelete, clearPendingDelete, isPendingDelete } from "@/utils/pending-deletes";
import { saveFailedRestore, removeFailedRestore, listFailedRestores } from "@/utils/failed-restores";
import { sendLeaveSave } from "@/utils/leave-save";
import { announceLeave } from "@/utils/leave-handoff";
import { conflictStamp } from "@/utils/background-conflict";
import { v4 as uuidv4 } from "uuid";

export interface NotesOperations {
  addNote: (templateContent?: string, templateTitle?: string) => Promise<void>;
  updatePinStatus: (noteId: string, isPinned: boolean) => Promise<void>;
  updatePrivacyStatus: (noteId: string, isPrivate: boolean) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  restoreNote: () => Promise<void>;
  /** Give up on a guest note whose Undo failed: drop its kept snapshot. */
  discardFailedRestore: () => Promise<void>;
  saveNoteContent: (
    noteId: string,
    content: string,
    goal: number,
    goalType: "" | "words" | "characters",
    opts?: SaveContentOpts,
  ) => Promise<{ success: boolean; version?: number }>;
  saveNoteTitle: (noteId: string, title: string) => Promise<{ success: boolean }>;
  refreshSingleNote: (noteId: string) => Promise<CombinedNote | null>;
  transferNote: (noteId: string, targetSource: NoteSource) => Promise<void>;
  /**
   * Make an unsaved edit durable while the tab is hiding or closing. Runs
   * synchronously up to the IDB/network requests (an unload handler can't
   * await): IDB cache copy, offline-queue entry, and — for cloud notes — a
   * keepalive save. A normal save still runs after it and, when it lands,
   * clears the queue entry again.
   */
  persistForLeave: (
    noteId: string,
    content: string,
    goal: number,
    goalType: "" | "words" | "characters",
    opts: { baseVersion?: number; closing: boolean; collabState?: string },
  ) => void;
}

export interface SaveContentOpts {
  projection?: boolean;
  baseVersion?: number;
  /**
   * The editor's Yjs doc state, read only if the save fails and is queued: the
   * replay then merges it into the note's doc instead of version-checking
   * (a collaborative note; see offline-queue QueuedUpdateOp.collabState).
   */
  collabState?: () => string | undefined;
}
import { HAS_INITIALISED_KEY } from "@/constants/app";
import { formatDateTime } from "@/utils/format-date";

function targetCollab(state: string | undefined): { collabState?: string } {
  return state ? { collabState: state } : {};
}

function collabStateOf(opts: SaveContentOpts | undefined): { collabState?: string } {
  try {
    return targetCollab(opts?.collabState?.());
  } catch {
    return {};
  }
}

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

    if (!localStorage.getItem(HAS_INITIALISED_KEY)) {
      localStorage.setItem(HAS_INITIALISED_KEY, "true");
    }

    // Read the live store, not the closure's `notes` snapshot: when addNote is
    // called in a loop (e.g. importing several files at once), the closure value
    // is stale, so each call would build [newNote, ...originalNotes] and drop
    // the notes added by earlier iterations — only the last would show until a
    // manual refresh. getState() reflects each optimistic insert immediately.
    const currentNotes = useNotesStore.getState().notes;

    // "New Note #N": number by the notes that actually exist, filling the lowest
    // free slot, rather than an ever-incrementing counter that kept climbing
    // past how many notes remained after deletions. Deleted (trashed) notes free
    // their number for reuse.
    const usedNumbers = new Set<number>();
    for (const n of currentNotes) {
      if (n.deletedAt) continue;
      const m = /^New Note #(\d+)$/.exec((n.title || "").trim());
      if (m) usedNumbers.add(parseInt(m[1], 10));
    }
    let noteNumber = 1;
    while (usedNumbers.has(noteNumber)) noteNumber++;

    const newNoteInput: CreateNoteInput = {
      id: generateNoteId(currentNotes.map((n) => n.id)),
      title: templateTitle || `New Note #${noteNumber}`,
      content: templateContent || "",
    };

    const newNote = createNote(newNoteInput, noteSource);
    newNote.order = 0; // Mark as new with order 0

    // Set author immediately for authenticated users
    if (isAuthenticated && userId) {
      newNote.author = userId;
    }

    // Auto-assign to active notebook if viewing one
    const { activeNotebookId } = useNotesStore.getState();
    if (activeNotebookId && activeNotebookId !== "loose" && noteSource === "supabase") {
      newNote.notebookId = activeNotebookId;
    }

    // Optimistic update - note will be at the top
    setAnimating(true);
    setNewNoteId(newNote.id);

    // Select the new note immediately
    useNotesStore.getState().setActiveNoteId(newNote.id);

    // Add note and immediately re-sort with newNoteId priority
    const updatedNotes = [newNote, ...currentNotes];
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
      if (!userId || isPendingDelete(noteId)) return;

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
      if (!userId || isPendingDelete(noteId)) return;

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
        noteToTransfer.version = 1; // fresh record in the target store

        if (!validateContentPreservation(localNote, noteToTransfer)) {
          console.error("Content lost during cloning, attempting recovery");
          noteToTransfer.content = localNote.content;
        }

        // Optimistic update - add the new note and HARD-remove the old one so
        // the moved note never shows twice (a soft-delete could be un-hidden by
        // a refresh landing before the source delete settles).
        optimisticAddNote(noteToTransfer);
        useNotesStore.getState().removeNote(noteId);
        // If the moved note was the open one, follow it to its new id so the
        // editor doesn't land on the now-deleted original.
        if (useNotesStore.getState().activeNoteId === noteId) {
          useNotesStore.getState().setActiveNoteId(noteToTransfer.id);
        }

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

        // A cloud note gets a baseline history entry on transfer so it has a
        // recoverable snapshot from the moment it landed in the account.
        if (targetSource === "supabase" && createResult?.success) {
          saveVersion(
            noteToTransfer.id,
            noteToTransfer.title,
            noteToTransfer.content,
            noteToTransfer.contentFormat || "markdown",
            "transfer",
            1,
          ).catch(() => {});
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
        // Other tabs: the note moved storage — refresh so it shows in its new
        // location and not the old one.
        broadcastNotesChanged();
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

  // Sync and Renumber Notes — fetches fresh data from server, then renumbers
  const syncAndRenumberNotes = useCallback(async () => {
    if (!userId) return;

    setReordering(true);

    try {
      // Flush all pending saves before fetching
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

      // Fetch fresh data from server (Redis + Supabase)
      await refreshNotes();

      // Read the now-fresh notes from the store
      const freshNotes = useNotesStore.getState().notes;

      // Normalize ordering on fresh data
      const renumberedNotes = normaliseOrdering(freshNotes);
      const sortedNotes = sortNotes(renumberedNotes);

      // Optimistic update
      optimisticReorderNotes(sortedNotes);

      // Batch update backend with renumbered orders
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
    } finally {
      setReordering(false);
    }
  }, [
    userId,
    optimisticReorderNotes,
    setReordering,
    noteFlushFunctions,
    refreshNotes,
  ]);

  // The server delete call of each note deleted in this undo window, and how it
  // ended: "deleted" (the server has it deleted) or "queued" (it failed and the
  // offline queue will retry it). An undo waits for it, so a delete can never
  // land after the restore.
  const deleteCallsRef = useRef<Map<string, Promise<"deleted" | "queued">>>(new Map());
  // Declared further down; restoreNote reaches them through these.
  const saveNoteContentRef = useRef<NotesOperations["saveNoteContent"]>(async () => ({ success: false }));
  const refreshSingleNoteRef = useRef<NotesOperations["refreshSingleNote"]>(async () => null);

  // Delete a note. It is deleted on the server straight away (Supabase: soft
  // delete into Trash; guest: removed) — the 10s toast is only the window in
  // which Undo can restore it, and nothing that ends the toast (✕, a second
  // delete, leaving the page) cancels the delete. Until the server has
  // confirmed it, the note is a pending delete (utils/pending-deletes): every
  // list rebuild keeps it hidden and nothing may write to it.
  const deleteNote = useCallback(
    async (noteId: string) => {
      if (!userId) return;

      const store = useNotesStore.getState();
      const live = store.notes.find((note) => note.id === noteId);
      if (!live || live.deletedAt) return;

      // What Undo brings back: the note as it is on screen, including keystrokes
      // still inside the open editor's debounce. Nothing from here on is saved.
      let latest = live.content;
      try {
        const handle = editorHandleFor(noteId);
        if (handle) latest = handle.currentContent();
      } catch {
        /* no editor: the store copy is the latest */
      }
      const snapshot: CombinedNote = { ...live, content: latest };

      // 1. From here nothing can write to it (saves, retries, queued edits,
      //    background pushes) or bring it back (refresh, realtime, reconcile).
      //    Durable, so a reload during the window keeps it hidden too.
      markPendingDelete({
        id: noteId,
        source: live.source,
        account: live.source === "supabase" ? getActiveSupabaseUser() : null,
        at: Date.now(),
      });
      // 2. Nothing already queued for it replays onto it (offline edits, a create).
      dropQueuedOps(noteId).catch(() => {});
      // Its editor's edits are moot now; a lingering "editing" mark would also
      // hold off refreshes.
      store.setEditing(noteId, false);

      // 3. Hide it here and in this browser's other tabs, and move the editor
      //    on: the note at the same place in the list, else the empty state.
      const visibleBefore = store.getFilteredNotes();
      const position = Math.max(0, visibleBefore.findIndex((n) => n.id === noteId));
      optimisticDeleteNote(noteId);
      broadcastNoteDeleted(noteId);
      const after = useNotesStore.getState();
      if (after.activeNoteId === noteId) {
        const remaining = after.getFilteredNotes();
        after.setActiveNoteId(
          remaining.length > 0 ? remaining[Math.min(position, remaining.length - 1)].id : null,
        );
      }
      saveNoteToLocal({ ...snapshot, deletedAt: Date.now(), updatedAt: Date.now() }).catch(() => {});

      // 4. Delete on the server now; on failure the offline queue retries it.
      const call = (async (): Promise<"deleted" | "queued"> => {
        try {
          const result =
            live.source === "redis"
              ? await noteOperation("redis", { operation: "delete", userId, noteId })
              : await deleteSupabaseNote(noteId);
          if (result?.success || deleteAlreadyDone(result)) {
            // The cached tombstone has done its job. The pending mark stays
            // until a fetched list shows the note gone (a fetch read before
            // this landed may still be on its way in).
            deleteLocalNote(noteId).catch(() => {});
            return "deleted";
          }
          console.error("Delete returned failure, queuing for retry:", (result as { error?: string })?.error);
        } catch (error) {
          console.error("Failed to delete note, queuing for retry:", error);
        }
        await enqueue({ type: "delete", noteId, source: live.source, userId }).catch(() => {});
        return "queued";
      })();
      deleteCallsRef.current.set(noteId, call);

      // 5. The undo window. Ending it only hides the toast.
      const timeoutId = setTimeout(() => {
        deleteCallsRef.current.delete(noteId);
        const s = useNotesStore.getState();
        if (s.recentlyDeleted?.note.id === noteId) s.clearRecentlyDeleted();
      }, 10000);
      store.setRecentlyDeleted(snapshot, timeoutId);
    },
    [userId, optimisticDeleteNote],
  );

  // Undo the last delete: put the note back exactly as it was on screen.
  const restoreNote = useCallback(async () => {
    const { recentlyDeleted, clearRecentlyDeleted, reinstateNote } = useNotesStore.getState();
    if (!recentlyDeleted || !userId) return;

    const snapshot: CombinedNote = { ...recentlyDeleted.note, deletedAt: null };
    const noteId = snapshot.id;
    clearRecentlyDeleted();

    // Let the delete call settle first, so it can't land after the restore.
    const outcome = (await deleteCallsRef.current.get(noteId)) ?? "deleted";
    deleteCallsRef.current.delete(noteId);
    // A delete that's still queued is simply cancelled.
    if (outcome === "queued") await dropQueuedOps(noteId).catch(() => {});
    await clearPendingDelete(noteId);

    reinstateNote(snapshot);
    saveNoteToLocal(snapshot).catch(() => {});
    // Other tabs dropped it on the delete broadcast — have them re-read.
    broadcastNotesChanged();

    // Once the server has it back (and only then, so this restore's own save
    // never races an editor), reopen it if nothing else is open.
    const reopen = () => {
      const s = useNotesStore.getState();
      if (!s.activeNoteId) s.setActiveNoteId(noteId);
    };
    try {
      if (snapshot.source === "supabase") {
        // Out of Trash (also harmless if the queued delete never ran).
        const r = await restoreSupabaseNote(noteId);
        if (!r?.success) throw new Error(r?.error || "Restore failed");
      }
      // Adopt the server's copy (its version), then — when the server doesn't
      // have the guest note any more — put it back as it was.
      const server = await refreshSingleNoteRef.current(noteId);
      if (!server) {
        if (snapshot.source !== "redis") throw new Error("Restored note not found");
        const r = await noteOperation("redis", { operation: "create", userId, note: combiToRedis(snapshot) });
        if (!r?.success) throw new Error((r as { error?: string })?.error || "Restore failed");
        await removeFailedRestore(noteId).catch(() => {});
        offerNextFailedRestore();
        reopen();
        return;
      }
      // Text typed just before the delete that never reached the server: save
      // it now, through the normal versioned save.
      if (!sameNoteContent(server.content, snapshot.content)) {
        await saveNoteContentRef.current(noteId, snapshot.content, snapshot.goal ?? 0, snapshot.goal_type ?? "");
      }
      if (snapshot.source === "redis") {
        await removeFailedRestore(noteId).catch(() => {});
        offerNextFailedRestore();
      }
      reopen();
    } catch (error) {
      console.error("Failed to restore note:", error);
      if (snapshot.source === "redis") {
        // The guest note is gone from the server (the delete went through), so
        // this snapshot is the only copy: a refresh would drop it for good.
        // Hide it again and keep the snapshot on the toast for another try.
        markPendingDelete({ id: noteId, source: snapshot.source, account: null, at: Date.now() });
        const s = useNotesStore.getState();
        s.removeNote(noteId);
        if (s.activeNoteId === noteId) s.setActiveNoteId(null);
        saveNoteToLocal({ ...snapshot, deletedAt: Date.now(), updatedAt: Date.now() }).catch(() => {});
        // Durable until restored or discarded: dismissing the toast or a
        // reload must not lose it (the next load offers the retry again).
        await saveFailedRestore(snapshot, userId).catch((e) => console.error("Couldn't keep the note's snapshot:", e));
        s.setRecentlyDeleted(snapshot, undefined, { restoreFailed: true });
        return;
      }
      await refreshNotes();
    }
  }, [userId, refreshNotes]);

  // Show the next kept snapshot (failed guest Undo), if any, on the toast.
  const offerNextFailedRestore = useCallback(() => {
    if (!userId) return;
    listFailedRestores(userId)
      .then((kept) => {
        const s = useNotesStore.getState();
        if (!kept.length || s.recentlyDeleted) return;
        const next = kept[0].note;
        markPendingDelete({ id: next.id, source: next.source, account: null, at: Date.now() });
        s.setRecentlyDeleted(next, undefined, { restoreFailed: true });
      })
      .catch(() => {});
  }, [userId]);

  // On load (and on a guest id change), offer the retry for any kept snapshot.
  useEffect(() => {
    offerNextFailedRestore();
  }, [offerNextFailedRestore]);

  // The user gives up on a failed restore: the only explicit way the kept
  // snapshot is dropped.
  const discardFailedRestore = useCallback(async () => {
    const s = useNotesStore.getState();
    const rd = s.recentlyDeleted;
    if (!rd?.restoreFailed) return;
    const noteId = rd.note.id;
    s.clearRecentlyDeleted();
    await removeFailedRestore(noteId).catch(() => {});
    await clearPendingDelete(noteId).catch(() => {});
    deleteLocalNote(noteId).catch(() => {});
    offerNextFailedRestore();
  }, [offerNextFailedRestore]);

  // Create a "(conflicted copy)" note (same storage) holding `copyContent`, so a
  // conflict never discards either side. Returns the new note id.
  const createConflictedCopy = useCallback(
    async (source: CombinedNote, baseTitle: string, copyContent: string): Promise<string | null> => {
      if (!userId || isPendingDelete(source.id)) return null;
      const stamp = formatDateTime(new Date());
      const copy = cloneNote(source);
      copy.id = generateNoteId(useNotesStore.getState().notes.map((n) => n.id));
      copy.title = `${baseTitle || "Untitled"} (conflicted copy, ${stamp})`;
      copy.content = copyContent;
      copy.version = 1;
      copy.createdAt = Date.now();
      copy.updatedAt = Date.now();
      copy.deletedAt = null;
      optimisticAddNote(copy);
      try {
        if (copy.source === "redis") {
          await noteOperation("redis", { operation: "create", userId, note: combiToRedis(copy) });
        } else {
          await createSupabaseNote(copy);
        }
      } catch (e) {
        console.error("Failed to create conflicted copy:", e);
      }
      return copy.id;
    },
    [userId, optimisticAddNote],
  );

  // The note being edited was deleted in another browser/tab. Never lose the
  // user's text: save it as a new "(recovered)" note, drop the deleted original
  // from view, and follow the active note across.
  const salvageDeletedEdit = useCallback(
    async (source: CombinedNote, content: string): Promise<string | null> => {
      if (!userId || isPendingDelete(source.id)) return null;
      const copy = cloneNote(source);
      copy.id = generateNoteId(useNotesStore.getState().notes.map((n) => n.id));
      copy.title = `${source.title || "Untitled"} (recovered)`;
      copy.content = content;
      copy.version = 1;
      copy.deletedAt = null;
      copy.createdAt = Date.now();
      copy.updatedAt = Date.now();
      optimisticAddNote(copy);
      useNotesStore.getState().removeNote(source.id);
      if (useNotesStore.getState().activeNoteId === source.id) {
        useNotesStore.getState().setActiveNoteId(copy.id);
      }
      try {
        if (copy.source === "redis") {
          await noteOperation("redis", { operation: "create", userId, note: combiToRedis(copy) });
        } else {
          await createSupabaseNote(copy);
        }
      } catch (e) {
        console.error("Failed to salvage deleted edit:", e);
      }
      return copy.id;
    },
    [userId, optimisticAddNote],
  );

  // Save Note Content — versioned (Phase 2). Sends the base version and, on a
  // conflict, keeps the user's local text, saves the server version as a
  // "(conflicted copy)", adopts the server version, and re-saves once.
  const saveNoteContent = useCallback(
    async (
      noteId: string,
      content: string,
      goal: number,
      goalType: "" | "words" | "characters",
      opts?: SaveContentOpts,
    ) => {
      if (!userId) return { success: false };
      // Deleted here: nothing more is saved to it (an editor's last flush or
      // retry). Reported as done so the editor stops retrying.
      if (isPendingDelete(noteId)) {
        useNotesStore.getState().setEditing(noteId, false);
        return { success: true };
      }

      const targetNote = useNotesStore.getState().notes.find((note) => note.id === noteId);
      if (!targetNote) {
        console.error("❌ Note not found for saving:", noteId);
        return { success: false };
      }

      const { setSaving, setEditing, setSaveError } = useNotesStore.getState();
      setSaving(noteId, true);
      setEditing(noteId, false);

      optimisticUpdateNote(noteId, { content, goal, goal_type: goalType, contentFormat: "markdown" });
      saveNoteToLocal(
        { ...targetNote, content, goal, goal_type: goalType, contentFormat: "markdown", updatedAt: Date.now() },
        { localEdit: true },
      ).catch(() => {});
      // What this full-content save replaces in the offline queue once it lands
      // (see dropSupersededUpdates below): this tab's earlier entries from the
      // same base. The base is the version the text was edited from.
      const saveStartedAt = queueClock();
      const startBase = opts?.baseVersion ?? targetNote.version;
      // Base of the last attempt — a failed save is queued against it, so the
      // replay CASes on it and never overwrites a newer server version.
      let attemptBase: number | undefined = startBase;

      try {
        // Serialize same-note saves across this browser's tabs (belt-and-braces
        // with the server-side atomic CAS), so two tabs don't both send a stale
        // base and spawn a redundant conflicted copy.
        const result = await withNoteLock(noteId, async () => {
          let handledConflict = false;
          // An explicit base version pins the version the caller edited FROM (the
          // editor passes this so an edit made during initial sync is CAS'd
          // against where it started, not a version reconcile may have advanced —
          // a newer server version then triggers the conflict path instead of a
          // silent overwrite). Cleared after a conflict so the retry uses the
          // adopted version.
          let pinnedBase = opts?.baseVersion;
          // Loop so a single conflict resolves + retries once.
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const storeVersion = useNotesStore.getState().notes.find((n) => n.id === noteId)?.version;
            const baseVersion = pinnedBase !== undefined ? pinnedBase : storeVersion;
            attemptBase = baseVersion;

            let r: any;
            if (targetNote.source === "redis") {
              r = await noteOperation("redis", {
                operation: "update", userId, noteId, content, goal, goalType, baseVersion,
              } as any);
            } else {
              r = await updateSupabaseNote(noteId, content, goal, goalType, {
                baseVersion,
                projection: opts?.projection,
              });
            }

            // Deleted here while this save was on its way: its answer is moot —
            // no copy, no retry (the delete is sent after it).
            if (isPendingDelete(noteId)) {
              setSaveError(noteId, false);
              return { success: true };
            }

            // The note was deleted elsewhere before this edit caught up. Never
            // lose the text: save it as a new "(recovered)" note. Two shapes:
            // Supabase returns a conflict whose current row is soft-deleted;
            // Redis returns not_found because the field is gone.
            const deletedOnServer =
              (r?.conflict && r.current && r.current.deletedAt) ||
              (targetNote.source === "redis" && r?.error === "not_found");
            if (deletedOnServer) {
              await salvageDeletedEdit(targetNote, content);
              setSaveError(noteId, false);
              return { success: true };
            }

            if (r?.conflict && r.current && !handledConflict) {
              // Spurious conflict: the server's current content already matches
              // what we're saving (our own earlier write landed, or a re-serialise
              // bumped the version with identical text). There's nothing to
              // preserve — adopt the server version as our base and report success,
              // no copy. Compared with the same normalisation as the save no-op.
              if (sameNoteContent(r.current.content, content)) {
                optimisticUpdateNote(noteId, { version: r.current.version });
                setLocalNoteVersion(noteId, r.current.version, content).catch(() => {});
                setSaveError(noteId, false);
                return { success: true, version: r.current.version };
              }
              // Real foreground conflict: keep local, snapshot server version as a
              // copy, adopt server version, retry once so the user's text wins.
              await createConflictedCopy(targetNote, r.current.title, r.current.content);
              optimisticUpdateNote(noteId, { version: r.current.version });
              handledConflict = true;
              pinnedBase = undefined; // retry against the adopted server version
              continue;
            }

            if (r?.success) {
              setSaveError(noteId, false);
              if (typeof r.version === "number") {
                optimisticUpdateNote(noteId, { version: r.version });
                // Keep the cache's version in step (it was written with the
                // pre-save version above) — see setLocalNoteVersion.
                setLocalNoteVersion(noteId, r.version, content).catch(() => {});
              }
            } else {
              setSaveError(noteId, true);
              // Awaited: a caller that flushes before acting on the queue (a
              // sign-out counting unsynced notes) must find this entry there.
              await enqueue({
                type: "update", noteId, source: targetNote.source, userId, content, goal, goalType,
                baseVersion, ...collabStateOf(opts),
              }).catch(() => {});
            }
            return r;
          }
        });

        // Tell other tabs so they refresh instead of re-saving stale content.
        if (result?.success) {
          // An older queued update (failed save, or the tab-hide write-ahead)
          // must not replay over this newer content later.
          dropSupersededUpdates(noteId, {
            startedAt: saveStartedAt,
            startBase,
            landedVersion: typeof result.version === "number" ? result.version : undefined,
            content,
          }).catch(() => {});
          broadcastNoteUpdate({
            noteId,
            version: typeof result.version === "number" ? result.version : undefined,
            content,
            contentFormat: "markdown",
          });
        }
        return result;
      } catch (error) {
        console.error("Failed to save note content, queuing for retry:", error);
        setSaveError(noteId, true);
        await enqueue({
          type: "update", noteId, source: targetNote.source, userId, content, goal, goalType,
          baseVersion: attemptBase, ...collabStateOf(opts),
        }).catch(() => {});
        return { success: false };
      } finally {
        setSaving(noteId, false);
      }
    },
    [userId, optimisticUpdateNote, createConflictedCopy, salvageDeletedEdit],
  );

  // Save Note Title
  const saveNoteTitle = useCallback(
    async (noteId: string, title: string) => {
      if (!userId) return { success: false };
      if (isPendingDelete(noteId)) return { success: true }; // deleted here

      // Read notes from store directly to avoid stale closure
      const currentNotes = useNotesStore.getState().notes;
      const targetNote = currentNotes.find((note) => note.id === noteId);
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

        // Queue for retry on a non-throwing server failure so the rename sticks
        if (!result?.success) {
          enqueue({
            type: "updateTitle",
            noteId,
            source: targetNote.source,
            userId,
            title,
          });
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
    [userId, optimisticUpdateNote, setSaving],
  );

  const refreshSingleNote = useCallback(
    async (noteId: string): Promise<CombinedNote | null> => {
      if (!userId) return null;
      if (isPendingDelete(noteId)) return null; // server data would show it live

      const currentNotes = useNotesStore.getState().notes;
      const targetNote = currentNotes.find((note) => note.id === noteId);
      if (!targetNote) return null;

      try {
        let updatedNote: CombinedNote | null = null;

        if (targetNote.source === "redis") {
          // Redis stores all notes as one blob — must fetch all
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
          // Supabase — fetch just this one note
          const result = await getSupabaseNoteById(noteId);
          if (result.success && result.note) {
            updatedNote = result.note;
          }
        }

        if (updatedNote && !isPendingDelete(noteId)) {
          optimisticUpdateNote(noteId, updatedNote);
          return updatedNote;
        }
      } catch (error) {
        console.error("Failed to refresh single note:", error);
      }

      return null;
    },
    [userId, optimisticUpdateNote],
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

  const persistForLeave = useCallback(
    (
      noteId: string,
      content: string,
      goal: number,
      goalType: "" | "words" | "characters",
      opts: { baseVersion?: number; closing: boolean; collabState?: string },
    ) => {
      if (!userId || isPendingDelete(noteId)) return;
      // A collaborative note's doc state rides along on every write below:
      // merged into the stored doc, not version-checked (cloud notes only).
      const collab = targetCollab(opts.collabState);
      const targetNote = useNotesStore.getState().notes.find((note) => note.id === noteId);
      if (!targetNote) return;

      optimisticUpdateNote(noteId, { content, goal, goal_type: goalType, contentFormat: "markdown" });
      // Everything below is synchronous: a closing page may get no further
      // turn, so nothing here may wait on a promise or an IDB callback.
      // 1. The cache copy, unconfirmed until a save carrying it lands.
      saveLocalEditNow({
        ...targetNote, content, goal, goal_type: goalType, contentFormat: "markdown", updatedAt: Date.now(),
      });
      // One copy id for every write of this edit: if the server has moved on,
      // the keepalive save, the queue replay and another tab's handoff copy
      // make ONE conflicted copy.
      const baseVersion = opts.baseVersion ?? targetNote.version;
      const copyId = uuidv4();
      // 2. The offline-queue entry.
      enqueueContentNow({
        type: "update", noteId, source: targetNote.source, userId, content, goal, goalType,
        baseVersion, copyId, ...(targetNote.source === "supabase" ? collab : {}),
      });

      if (!opts.closing) return; // a tab switch: the page lives, its normal save follows

      // 3. Closing: hand the text to this browser's other tabs (delivered even
      // if this page dies right after), so one of them makes it durable and an
      // editor taking the note over adopts it before anything else.
      announceLeave({
        noteId,
        source: targetNote.source,
        userId: targetNote.source === "supabase" ? cloudAccountFor(userId) : userId,
        content,
        goal,
        goalType,
        baseVersion,
        copyId,
        ...(targetNote.source === "supabase" ? collab : {}),
      });
      // 4. A keepalive save, which can finish after the tab is gone — guest
      // notes too (under the device id, which is what authorises a guest save).
      // Over the keepalive size cap it is skipped; 1–3 cover it.
      if (targetNote.source === "supabase" && !isAuthenticated) return;
      sendLeaveSave({
        source: targetNote.source,
        ...(targetNote.source === "redis" ? { userId } : {}),
        noteId,
        content,
        goal,
        goalType,
        baseVersion,
        copyId,
        copyStamp: conflictStamp(),
        ...(targetNote.source === "supabase" ? collab : {}),
      });
    },
    [userId, isAuthenticated, optimisticUpdateNote],
  );

  saveNoteContentRef.current = saveNoteContent;
  refreshSingleNoteRef.current = refreshSingleNote;

  return useMemo(() => ({
    addNote,
    updatePinStatus,
    updatePrivacyStatus,
    deleteNote,
    restoreNote,
    discardFailedRestore,
    saveNoteContent,
    saveNoteTitle,
    refreshSingleNote,
    transferNote,
    persistForLeave,
  }), [addNote, updatePinStatus, updatePrivacyStatus, deleteNote, restoreNote, discardFailedRestore, saveNoteContent, saveNoteTitle, refreshSingleNote, transferNote, persistForLeave]);
}
