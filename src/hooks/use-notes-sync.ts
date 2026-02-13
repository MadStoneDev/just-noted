// src/hooks/use-notes-sync.ts
"use client";

import { useEffect, useRef, useCallback } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { createClient } from "@/utils/supabase/client";
import { getUserId } from "@/utils/general/notes";
import { sortNotes, normaliseOrdering } from "@/utils/notes-utils";
import { noteOperation } from "@/app/actions/notes";
import {
  createNote as createSupabaseNote,
  getNotesByUserId as getSupabaseNotesByUserId,
  getNoteMetadataByUserId,
  getNoteContentsByUserId,
  updateNote as updateSupabaseNote,
} from "@/app/actions/supabaseActions";
import {
  CombinedNote,
  NoteSource,
  CreateNoteInput,
  redisToCombi,
  combiToRedis,
  createNote,
} from "@/types/combined-notes";
import { generateNoteId } from "@/utils/general/notes";
import { getAllLocalNotes, saveAllNotesToLocal, clearLocalNotes } from "@/utils/notes-idb-cache";
import { processQueue, clearQueue } from "@/utils/offline-queue";
import {
  USER_NOTE_COUNT_KEY,
  HAS_INITIALISED_KEY,
  ACTIVITY_TIMEOUT,
  REFRESH_INTERVAL,
  AUTH_TIMEOUT,
  LAST_ACCESS_DEBOUNCE,
} from "@/constants/app";

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

/**
 * Merge local IDB cache with server notes.
 * Server wins on tie (>=). Local wins only if strictly newer.
 * Local-only notes created within 24h are kept (assumed offline-created).
 * Local-only notes older than 24h are dropped (assumed deleted on server).
 * Returns the merged note list and queues server pushes for local-winning notes.
 */
function mergeLocalWithServer(
  serverNotes: CombinedNote[],
  localNotes: CombinedNote[],
  userId: string,
  isAuthenticated: boolean,
): CombinedNote[] {
  const serverMap = new Map(serverNotes.map((n) => [n.id, n]));
  const localMap = new Map(localNotes.map((n) => [n.id, n]));
  const merged: CombinedNote[] = [];
  const now = Date.now();

  // Process all server notes
  for (const serverNote of serverNotes) {
    const localNote = localMap.get(serverNote.id);
    if (!localNote) {
      // No local version — use server
      merged.push(serverNote);
    } else if (localNote.updatedAt > serverNote.updatedAt) {
      // Local is strictly newer — use local, push to server in background
      merged.push(localNote);
      pushNoteToServer(localNote, userId, isAuthenticated).catch(() => {});
    } else {
      // Server wins (>=)
      merged.push(serverNote);
    }
  }

  // Process local-only notes (in IDB but not on server)
  for (const localNote of localNotes) {
    if (!serverMap.has(localNote.id)) {
      if (now - localNote.createdAt < TWENTY_FOUR_HOURS) {
        // Recently created — assume created offline, keep + push to server
        merged.push(localNote);
        pushNoteToServer(localNote, userId, isAuthenticated).catch(() => {});
      }
      // Else: old note not on server — assume deleted, drop it
    }
  }

  return merged;
}

/**
 * Push a local-winning note to the server.
 */
async function pushNoteToServer(
  note: CombinedNote,
  userId: string,
  isAuthenticated: boolean,
): Promise<void> {
  try {
    if (note.source === "redis") {
      await noteOperation("redis", {
        operation: "update",
        userId,
        noteId: note.id,
        content: note.content,
        goal: note.goal,
        goalType: note.goal_type,
      });
    } else if (isAuthenticated) {
      await updateSupabaseNote(note.id, note.content, note.goal ?? 0, note.goal_type ?? "");
    }
  } catch (error) {
    console.error("Failed to push local note to server:", error);
  }
}

export function useNotesSync() {
  const supabase = createClient();

  // Get store state and actions
  const {
    syncFromBackend,
    mergeWithBackend,
    setLoading,
    markUpdated,
    setUserId,
    setAuthenticated,
    recalculateNotebookCounts,
    userId,
    isAuthenticated,
  } = useNotesStore();

  const hasInitialisedRef = useRef(false);
  const isInitializingRef = useRef(false);
  const isMounted = useRef(true);
  const noteFlushFunctionsRef = useRef<Map<string, () => void>>(new Map());
  const lastUpdateTimestamp = useRef(Date.now());
  const lastAccessTimestamp = useRef(0);

  // Load notes from Redis
  const loadNotesFromRedis = useCallback(async (): Promise<CombinedNote[]> => {
    const currentUserId = useNotesStore.getState().userId;
    if (!currentUserId) return [];

    try {
      const result = await noteOperation("redis", {
        operation: "getAll",
        userId: currentUserId,
      });
      if (result.success && result.notes) {
        return result.notes.map(redisToCombi);
      }
    } catch (error) {
      console.error("Failed to load Redis notes:", error);
    }
    return [];
  }, []);

  // Load notes from Supabase
  const loadNotesFromSupabase = useCallback(async (): Promise<CombinedNote[]> => {
    const currentIsAuthenticated = useNotesStore.getState().isAuthenticated;
    if (!currentIsAuthenticated) return [];

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

  // Update last access timestamp
  const updateLastAccess = useCallback(async () => {
    const currentUserId = useNotesStore.getState().userId;
    if (!currentUserId) return;

    try {
      await fetch("/api/user-activity", {
        method: "POST",
        body: JSON.stringify({ userId: currentUserId }),
      });
    } catch (error) {
      console.error("Failed to update last access:", error);
    }
  }, []);

  // Refresh notes from backend
  const refreshNotes = useCallback(async () => {
    const currentUserId = useNotesStore.getState().userId;
    if (!currentUserId || !isMounted.current) return;

    try {
      const [redisNotes, supabaseNotes] = await Promise.all([
        loadNotesFromRedis(),
        loadNotesFromSupabase(),
      ]);

      const allNotes = [...redisNotes, ...supabaseNotes];
      const normalisedNotes = normaliseOrdering(allNotes);
      const sortedNotes = sortNotes(normalisedNotes, null);

      if (isMounted.current) {
        mergeWithBackend(sortedNotes);
        recalculateNotebookCounts();
        markUpdated();
        lastUpdateTimestamp.current = Date.now();
        saveAllNotesToLocal(sortedNotes).catch(() => {});
      }
    } catch (error) {
      console.error("Failed to refresh notes:", error);
    }
  }, [loadNotesFromRedis, loadNotesFromSupabase, mergeWithBackend, markUpdated, recalculateNotebookCounts]);

  // Initialize
  useEffect(() => {
    isMounted.current = true;
    if (hasInitialisedRef.current || isInitializingRef.current) return;

    // Prevent concurrent initializations without blocking retry on failure
    isInitializingRef.current = true;

    const initialize = async () => {
      try {
        // Check IDB cache first for instant render
        const cachedNotes = await getAllLocalNotes();
        if (cachedNotes.length > 0) {
          syncFromBackend(cachedNotes);
          recalculateNotebookCounts();
          setLoading(false);
          // Continue loading fresh data in background below
        }

        // One-time cleanup of old localStorage cache
        localStorage.removeItem("justnoted_notes_cache");
        localStorage.removeItem("justnoted_notes_cache_ts");
        localStorage.removeItem("justnoted_offline_queue");

        // Get or create user ID
        const newUserId = getUserId();
        setUserId(newUserId);

        if (!newUserId) {
          throw new Error("Failed to get user ID");
        }

        // Check authentication status with timeout to avoid infinite hang
        let authenticated = false;
        try {
          const authResult = await Promise.race([
            supabase.auth.getUser(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Auth timeout")), AUTH_TIMEOUT)
            ),
          ]);
          authenticated = !!authResult.data?.user;
        } catch (authError) {
          console.warn("Auth check failed or timed out, proceeding as unauthenticated:", authError);
          authenticated = false;
        }
        setAuthenticated(authenticated);

        // Phase 1: Load Redis notes (full) + Supabase metadata (no content) in parallel
        const [redisResult, supabaseMetadataResult] = await Promise.allSettled([
          noteOperation("redis", { operation: "getAll", userId: newUserId }),
          authenticated
            ? getNoteMetadataByUserId()
            : Promise.resolve({ success: true, notes: [] }),
        ]);

        const redisNotes =
          redisResult.status === "fulfilled" &&
          redisResult.value.success &&
          redisResult.value.notes
            ? redisResult.value.notes.map(redisToCombi)
            : [];

        const supabaseNotesMetadata =
          supabaseMetadataResult.status === "fulfilled" &&
          supabaseMetadataResult.value.success &&
          supabaseMetadataResult.value.notes
            ? supabaseMetadataResult.value.notes
            : [];

        let allNotes = [...redisNotes, ...supabaseNotesMetadata];

        // Create default note if none exist
        if (allNotes.length === 0) {
          const defaultNoteSource: NoteSource = authenticated ? "supabase" : "redis";
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
              userId: newUserId,
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

        // Preserve cached content for Supabase notes during metadata-only phase
        const existingNotes = useNotesStore.getState().notes;
        const existingContentMap = new Map(
          existingNotes
            .filter((n) => n.source === "supabase" && n.content)
            .map((n) => [n.id, n.content])
        );

        const notesWithPreservedContent = allNotes.map((note) => {
          if (note.source === "supabase" && !note.content && existingContentMap.has(note.id)) {
            return { ...note, content: existingContentMap.get(note.id)! };
          }
          return note;
        });

        const normalizedNotes = normaliseOrdering(notesWithPreservedContent);
        const sortedNotes = sortNotes(normalizedNotes, null);

        // Merge IDB cache with server — local wins if newer
        const mergedNotes = mergeLocalWithServer(sortedNotes, cachedNotes, newUserId, authenticated);

        // Render immediately with metadata + preserved cached content
        syncFromBackend(mergedNotes);
        recalculateNotebookCounts();
        saveAllNotesToLocal(mergedNotes).catch(() => {});

        // Phase 2: Backfill Supabase content in background
        if (authenticated && supabaseNotesMetadata.length > 0) {
          getNoteContentsByUserId().then((contentsResult) => {
            if (!isMounted.current || !contentsResult.success || !contentsResult.contents) return;

            const contentMap = new Map(
              contentsResult.contents.map((c: { id: string; content: string }) => [c.id, c.content])
            );

            const currentNotes = useNotesStore.getState().notes;
            const updatedNotes = currentNotes.map((note) => {
              const content = contentMap.get(note.id);
              if (content !== undefined && note.source === "supabase") {
                return { ...note, content };
              }
              return note;
            });

            if (isMounted.current) {
              syncFromBackend(updatedNotes);
              saveAllNotesToLocal(updatedNotes).catch(() => {});
            }
          }).catch((error) => {
            console.error("Failed to backfill Supabase content:", error);
          });
        }

        // Mark as initialised only after successful completion
        hasInitialisedRef.current = true;

        // Drain any queued offline operations from previous session
        processQueue().catch(() => {});
      } catch (error) {
        console.error("Initialization error:", error);
        // Allow retry on next effect run by not setting hasInitialisedRef
      } finally {
        isInitializingRef.current = false;
        setLoading(false);
      }
    };

    initialize();
  }, [supabase, syncFromBackend, setLoading, setUserId, setAuthenticated, recalculateNotebookCounts]);

  // Auth change listener
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_: string, session: any) => {
        const wasAuthenticated = useNotesStore.getState().isAuthenticated;
        const nowAuthenticated = !!session?.user;

        setAuthenticated(nowAuthenticated);

        if (hasInitialisedRef.current && wasAuthenticated !== nowAuthenticated) {
          // Clear IDB cache and offline queue on logout to prevent data leaking to next user
          if (wasAuthenticated && !nowAuthenticated) {
            clearLocalNotes().catch(() => {});
            clearQueue().catch(() => {});
          }
          await refreshNotes();
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase, refreshNotes, setAuthenticated]);

  // Periodic refresh - only when user is not actively editing
  useEffect(() => {
    if (!hasInitialisedRef.current) return;

    const interval = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastUpdateTimestamp.current;
      const { isEditing, isSaving } = useNotesStore.getState();

      // Don't refresh if any note is being edited or saved
      const isAnyNoteActive = isEditing.size > 0 || isSaving.size > 0;

      if (timeSinceLastUpdate > ACTIVITY_TIMEOUT && !isAnyNoteActive) {
        refreshNotes();
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [refreshNotes]);

  // Update last access on user activity (throttled to 5 minutes)
  useEffect(() => {
    if (!hasInitialisedRef.current) return;

    const throttledUpdateLastAccess = () => {
      const now = Date.now();
      if (now - lastAccessTimestamp.current >= LAST_ACCESS_DEBOUNCE) {
        lastAccessTimestamp.current = now;
        updateLastAccess();
      }
    };

    window.addEventListener("mousemove", throttledUpdateLastAccess);
    window.addEventListener("keydown", throttledUpdateLastAccess);
    window.addEventListener("click", throttledUpdateLastAccess);

    // Fire once on mount
    throttledUpdateLastAccess();

    return () => {
      window.removeEventListener("mousemove", throttledUpdateLastAccess);
      window.removeEventListener("keydown", throttledUpdateLastAccess);
      window.removeEventListener("click", throttledUpdateLastAccess);
    };
  }, [updateLastAccess]);

  // Cleanup
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Register/unregister flush functions for notes
  const registerNoteFlush = useCallback((noteId: string, flushFn: () => void) => {
    noteFlushFunctionsRef.current.set(noteId, flushFn);
  }, []);

  const unregisterNoteFlush = useCallback((noteId: string) => {
    noteFlushFunctionsRef.current.delete(noteId);
  }, []);

  return {
    userId,
    isAuthenticated,
    refreshNotes,
    registerNoteFlush,
    unregisterNoteFlush,
    noteFlushFunctions: noteFlushFunctionsRef,
    updateLastAccess,
  };
}
