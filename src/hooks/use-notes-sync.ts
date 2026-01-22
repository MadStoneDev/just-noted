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
import {
  USER_NOTE_COUNT_KEY,
  HAS_INITIALISED_KEY,
  ACTIVITY_TIMEOUT,
  REFRESH_INTERVAL,
} from "@/constants/app";

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
    userId,
    isAuthenticated,
  } = useNotesStore();

  const hasInitialisedRef = useRef(false);
  const isMounted = useRef(true);
  const noteFlushFunctionsRef = useRef<Map<string, () => void>>(new Map());
  const lastUpdateTimestamp = useRef(Date.now());

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
        markUpdated();
        lastUpdateTimestamp.current = Date.now();
      }
    } catch (error) {
      console.error("Failed to refresh notes:", error);
    }
  }, [loadNotesFromRedis, loadNotesFromSupabase, mergeWithBackend, markUpdated]);

  // Initialize
  useEffect(() => {
    if (!isMounted.current || hasInitialisedRef.current) return;

    const initialize = async () => {
      try {
        // Get or create user ID
        const newUserId = getUserId();
        setUserId(newUserId);

        if (!newUserId) {
          throw new Error("Failed to get user ID");
        }

        // Check authentication status
        const { data: authData } = await supabase.auth.getUser();
        const authenticated = !!authData?.user;
        setAuthenticated(authenticated);

        // Load notes from both sources
        const [redisResult, supabaseResult] = await Promise.allSettled([
          noteOperation("redis", { operation: "getAll", userId: newUserId }),
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

        const normalizedNotes = normaliseOrdering(allNotes);
        const sortedNotes = sortNotes(normalizedNotes, null);

        syncFromBackend(sortedNotes);
        hasInitialisedRef.current = true;
      } catch (error) {
        console.error("Initialization error:", error);
        hasInitialisedRef.current = true;
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [supabase, syncFromBackend, setLoading, setUserId, setAuthenticated]);

  // Auth change listener
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_, session) => {
        const wasAuthenticated = useNotesStore.getState().isAuthenticated;
        const nowAuthenticated = !!session?.user;

        setAuthenticated(nowAuthenticated);

        if (hasInitialisedRef.current && wasAuthenticated !== nowAuthenticated) {
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
      updateLastAccess();
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [refreshNotes, updateLastAccess]);

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
