// src/hooks/use-notes-sync.ts
"use client";

import { useEffect, useRef, useCallback } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { createClient } from "@/utils/supabase/client";
import { getUserId } from "@/utils/general/notes";
import { sortNotes, normaliseOrdering, sameNoteContent } from "@/utils/notes-utils";
import { noteOperation } from "@/app/actions/notes";
import { fetchNotesRevision } from "@/lib/notes-revision-client";
import {
  getNotesByUserId as getSupabaseNotesByUserId,
  updateNote as updateSupabaseNote,
} from "@/app/actions/supabaseActions";
import {
  CombinedNote,
  NoteSource,
  SupabaseNote,
  redisToCombi,
  supabaseToCombi,
} from "@/types/combined-notes";
import { getAllLocalNotes, saveAllNotesToLocal, saveNoteToLocal } from "@/utils/notes-idb-cache";
import {
  LEGACY_COPY_BASE_VERSION,
  legacyCopyId,
  legacyCacheSourcesPending,
  markLegacyCacheChecked,
} from "@/utils/legacy-cache";
import {
  processQueue,
  enqueue,
  migrateUntaggedCloudOps,
  getPendingContentByNote,
  warmQueueConnection,
  subscribeConflicts,
} from "@/utils/offline-queue";
import { conflictStamp } from "@/utils/background-conflict";
import { v4 as uuidv4 } from "uuid";
import { setActiveSupabaseUser } from "@/utils/offline-queue-guard";
import { notesNotToWrite, editorHandleFor } from "@/utils/note-ownership";
import { reconcileNotes, protectUnsyncedLocal, keepChangesMadeDuringLoad, type PendingContent } from "@/utils/notes-merge";
import { subscribeNoteUpdates } from "@/utils/cross-tab";
import { stripHtmlToText } from "@/utils/html-utils";
import {
  HAS_INITIALISED_KEY,
  REFRESH_INTERVAL,
  VISIBLE_REFRESH_INTERVAL,
  MIN_REFRESH_GAP,
  AUTH_TIMEOUT,
  AUTH_MAX_RETRIES,
  INIT_RETRY_DELAYS,
  LAST_ACCESS_DEBOUNCE,
} from "@/constants/app";


const DEFAULT_TITLE_PATTERN = /^New Note #\d+$/;

function isEmptyDefaultNote(note: CombinedNote): boolean {
  if (note.source !== "redis") return false;
  if (!DEFAULT_TITLE_PATTERN.test(note.title)) return false;
  const content = note.content?.trim() || "";
  if (content.length === 0) return true;
  const plainText = stripHtmlToText(content);
  return plainText.trim().length === 0;
}

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
  pending: Map<string, PendingContent> = new Map(),
  notToWrite: ReadonlySet<string> = new Set(),
  legacyCacheSources: ReadonlySet<NoteSource> = new Set(),
): { merged: CombinedNote[]; legacyCopies: Promise<CombinedNote[]> } {
  // The decision logic is pure and unit-tested in utils/notes-merge; here we
  // just carry out the side effects it prescribes.
  const { merged, toPush, toDelete, toConflictCopy, toLegacyCopy } = reconcileNotes(
    serverNotes,
    localNotes,
    Date.now(),
    { legacyCacheSources },
  );

  // One upload path per note: a note an editor owns is uploaded by that editor
  // (here: hand it over), never pushed from here; one owned by another tab or
  // with a save in flight is left alone. Everything else goes out as a
  // versioned background CAS write — the server decides apply / copy / no-op.
  const upload = (note: CombinedNote) => {
    const handle = editorHandleFor(note.id);
    if (handle) return handle.upload(note);
    if (notToWrite.has(note.id)) return;
    pushNoteToServer(note, userId, isAuthenticated).catch(() => {});
  };
  for (const note of toPush) upload(note);
  for (const note of toDelete) {
    enqueue({ type: "delete", noteId: note.id, source: note.source, userId }).catch(() => {});
  }
  // The server moved past the version our cached text was edited from. That is
  // the server's call, not ours: send the text on its own base through the
  // same CAS as every other background write. If it's still divergent the
  // server keeps its note and saves ours as one "(conflicted copy)" (identical
  // text: nothing). A versioned queued edit holding this text makes that same
  // write when the queue replays — don't send it twice.
  for (const local of toConflictCopy) {
    const q = pending.get(local.id);
    if (q && typeof q.baseVersion === "number" && sameNoteContent(q.content, local.content)) continue;
    if (notToWrite.has(local.id) || editorHandleFor(local.id)) continue;
    pushNoteToServer(local, userId, isAuthenticated).catch(() => {});
  }
  // Cached copies from a build before `localEdit` that are newer than the
  // server (first load on this build only — see utils/legacy-cache). Always a
  // copy, never a write on the note: base 0 is below every real version, so the
  // server keeps its note and saves ours beside it (same text: nothing). The
  // copy id is fixed per record, so other tabs / a retry make no second copy.
  // Not skipped for an open note: the copy is a new note, it can't race the
  // editor's save. A queued edit with this text makes its own decision when the
  // queue replays. Resolves to the records whose copy didn't land.
  const legacyCopies = Promise.all(
    toLegacyCopy.map(async (local) => {
      const q = pending.get(local.id);
      if (q && sameNoteContent(q.content, local.content)) return null;
      const ok = await pushNoteToServer(local, userId, isAuthenticated, {
        baseVersion: LEGACY_COPY_BASE_VERSION,
        copyId: legacyCopyId(local),
      });
      return ok ? null : local;
    }),
  ).then((r) => r.filter((n): n is CombinedNote => n !== null));
  return { merged, legacyCopies };
}

/**
 * Push a local-winning note to the server (load reconcile, refresh guard) as a
 * background CAS write on the version it was edited from (`note.version`): if
 * the server has moved on since, the server note is kept and this text becomes
 * a "(conflicted copy)" (see utils/background-conflict). Never the legacy
 * always-land path.
 */
const pushConflictListeners = new Set<() => void>();

async function pushNoteToServer(
  note: CombinedNote,
  userId: string,
  isAuthenticated: boolean,
  override: { baseVersion?: number; copyId?: string } = {},
): Promise<boolean> {
  try {
    const cas = {
      baseVersion: override.baseVersion ?? note.version ?? 1,
      conflictCopy: { id: override.copyId ?? uuidv4(), stamp: conflictStamp() },
    };
    let r: { success: boolean; conflicted?: boolean } | undefined;
    if (note.source === "redis") {
      r = await noteOperation("redis", {
        operation: "update",
        userId,
        noteId: note.id,
        content: note.content,
        goal: note.goal,
        goalType: note.goal_type,
        ...cas,
      });
    } else if (isAuthenticated) {
      r = await updateSupabaseNote(note.id, note.content, note.goal ?? 0, note.goal_type ?? "", cas);
    }
    // Another save landed between our read and this write: the server kept it
    // and made the copy. Refresh so both show.
    if (r?.conflicted) pushConflictListeners.forEach((cb) => cb());
    return !!r?.success;
  } catch (error) {
    console.error("Failed to push local note to server:", error);
    return false;
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
  const loadStartedAtRef = useRef<number | null>(null);
  const isMounted = useRef(true);
  const initRetryCount = useRef(0);
  const initRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteFlushFunctionsRef = useRef<Map<string, () => void>>(new Map());
  const lastUpdateTimestamp = useRef(Date.now());
  const lastAccessTimestamp = useRef(0);

  // Load notes from Redis (returns null on failure to distinguish from "no notes")
  const loadNotesFromRedis = useCallback(async (): Promise<CombinedNote[] | null> => {
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
      if (result.success) return [];
      // Explicit failure from the server action
      console.error("Redis load returned failure:", (result as any).error);
      return null;
    } catch (error) {
      console.error("Failed to load Redis notes:", error);
      return null;
    }
  }, []);

  // Load notes from Supabase (returns null on failure to distinguish from "no notes")
  const loadNotesFromSupabase = useCallback(async (): Promise<CombinedNote[] | null> => {
    const currentIsAuthenticated = useNotesStore.getState().isAuthenticated;
    if (!currentIsAuthenticated) return [];

    try {
      const result = await getSupabaseNotesByUserId();
      if (result.success && result.notes) {
        return result.notes;
      }
      if (result.success) return [];
      console.error("Supabase load returned failure:", result.error);
      return null;
    } catch (error) {
      console.error("Failed to load Supabase notes:", error);
      return null;
    }
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

  // Refresh notes from backend (re-checks auth to recover from earlier timeouts)
  const refreshNotes = useCallback(async () => {
    const currentUserId = useNotesStore.getState().userId;
    if (!currentUserId || !isMounted.current) return;

    try {
      // Re-check auth status to recover from init-time auth timeouts
      const wasAuthenticated = useNotesStore.getState().isAuthenticated;
      if (!wasAuthenticated) {
        try {
          const authResult = await Promise.race([
            supabase.auth.getUser(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Auth timeout")), AUTH_TIMEOUT)
            ),
          ]);
          const user = authResult.data?.user;
          if (user) {
            setActiveSupabaseUser(user.id);
            setAuthenticated(true);
          }
        } catch {
          // Auth still failing — continue with current state
        }
      }

      // Snapshot the store as the fetch starts: anything the user does while it
      // is in flight (e.g. Ctrl+J) is laid back over the result at commit — see
      // keepChangesMadeDuringLoad.
      const refreshStartedAt = Date.now();
      const refreshBaseline = useNotesStore.getState().notes;

      const [redisNotes, supabaseNotes] = await Promise.all([
        loadNotesFromRedis(),
        loadNotesFromSupabase(),
      ]);

      // If BOTH sources failed, don't touch the store — keep what we have
      if (redisNotes === null && supabaseNotes === null) {
        console.warn("Both note sources failed to load — keeping existing notes");
        return;
      }

      // Build the merged list, preserving existing notes from any source that failed
      const existingNotes = useNotesStore.getState().notes;
      const freshNotes: CombinedNote[] = [];

      if (redisNotes !== null) {
        freshNotes.push(...redisNotes);
      } else {
        // Redis failed — keep existing Redis notes
        freshNotes.push(...existingNotes.filter((n) => n.source === "redis"));
      }

      if (supabaseNotes !== null) {
        freshNotes.push(...supabaseNotes);
      } else {
        // Supabase failed — keep existing Supabase notes
        freshNotes.push(...existingNotes.filter((n) => n.source === "supabase"));
      }

      // Empty "New Note #N" notes are NOT filtered here any more: a refresh that
      // landed seconds after a create dropped the brand-new note from the store
      // (closing its editor mid-session). An empty starter note persisting is
      // fine; a note vanishing under the user is not (see never-auto-delete).
      const cleanedNotes = freshNotes;

      const normalisedNotes = normaliseOrdering(cleanedNotes);
      const serverSorted = sortNotes(normalisedNotes, null);

      // Never let this refresh overwrite a local copy with unsynced changes —
      // e.g. text another tab typed right before it was closed, which reached
      // this browser's IDB cache / offline queue but not the server. Keep it and
      // push it instead (see protectUnsyncedLocal).
      const [localNotes, pending, notToWrite] = await Promise.all([
        getAllLocalNotes(),
        getPendingContentByNote(),
        notesNotToWrite(),
      ]);
      const { notes: sortedNotes, toPush, fromQueue } = protectUnsyncedLocal(
        serverSorted,
        localNotes,
        pending,
        notToWrite,
      );

      if (isMounted.current) {
        const uid = useNotesStore.getState().userId;
        const authed = useNotesStore.getState().isAuthenticated;
        if (uid) {
          for (const note of toPush) {
            pushNoteToServer(note, uid, authed).catch(() => {});
          }
        }
        if (fromQueue.length > 0) processQueue().catch(() => {});

        // Same commit as startup: actions taken during the fetch survive it,
        // then the in-flight rule applies. Read + set in the same tick.
        mergeWithBackend(
          keepChangesMadeDuringLoad(
            sortedNotes,
            refreshBaseline,
            useNotesStore.getState().notes,
            refreshStartedAt,
          ),
        );
        recalculateNotebookCounts();
        markUpdated();
        lastUpdateTimestamp.current = Date.now();
        // Persist the merged store result (not the raw server list) so an
        // in-flight local edit preserved by mergeWithBackend isn't clobbered
        // in the cache by stale server content.
        saveAllNotesToLocal(useNotesStore.getState().notes).catch(() => {});
      }
    } catch (error) {
      console.error("Failed to refresh notes:", error);
    }
  }, [supabase, loadNotesFromRedis, loadNotesFromSupabase, mergeWithBackend, markUpdated, recalculateNotebookCounts, setAuthenticated]);

  // Initialize
  useEffect(() => {
    isMounted.current = true;
    if (hasInitialisedRef.current || isInitializingRef.current) return;

    // Prevent concurrent initializations without blocking retry on failure
    isInitializingRef.current = true;

    const initialize = async () => {
      try {
        // Open the offline queue's connection now so a tab-close flush can write
        // to it synchronously (see enqueueContentNow).
        warmQueueConnection();

        // One-time cleanup of old localStorage cache
        localStorage.removeItem("justnoted_notes_cache");
        localStorage.removeItem("justnoted_notes_cache_ts");
        localStorage.removeItem("justnoted_offline_queue");

        // When this session's load began (first attempt; kept across retries).
        // A note created after it and missing from the server list was made
        // during the load — see keepChangesMadeDuringLoad.
        loadStartedAtRef.current ??= Date.now();
        const loadStartedAt = loadStartedAtRef.current;

        // Who is signed in, from the local session (cookie) — race-free on a
        // fresh load right after login, and no network round-trip. getUser()
        // can time out or momentarily read as logged out, which would then load
        // only guest notes and leave the shell stale until a manual refresh
        // (the INITIAL_SESSION event fires before init completes, so the auth
        // listener's reconcile is skipped). Server actions still enforce real
        // auth via RLS, so trusting the local session for UI gating is safe.
        // Read first: the cache and the queue show only this account's cloud
        // notes (another account's are parked until it signs in again).
        let sessionUserId: string | null = null;
        try {
          const { data } = await supabase.auth.getSession();
          sessionUserId = data.session?.user?.id ?? null;
        } catch {
          // No readable session — proceed as unauthenticated.
        }
        const authenticated = !!sessionUserId;
        // B7: tell the offline queue which account owns cloud ops right now, so a
        // queued op from another account is never flushed under this session
        // (the queue survives sign-outs and the account-switch reload).
        setActiveSupabaseUser(sessionUserId);

        // STEP 0: Render IDB cache immediately for fast first paint. Notes
        // already in the store (created while the cache was being read, or
        // kept from an earlier attempt) win over their cached copies.
        const cachedNotes = await getAllLocalNotes();
        if (cachedNotes.length > 0) {
          const inStore = useNotesStore.getState().notes;
          const inStoreIds = new Set(inStore.map((n) => n.id));
          syncFromBackend([...inStore, ...cachedNotes.filter((n) => !inStoreIds.has(n.id))]);
          recalculateNotebookCounts();
          setLoading(false);
        }
        // What the store held when the load started: anything that differs
        // from this at commit time was done by the user during the load.
        const loadBaseline = useNotesStore.getState().notes;

        // STEP 1: Check authentication (single attempt with short timeout for speed)
        const newUserId = getUserId();
        setUserId(newUserId);

        if (!newUserId) {
          throw new Error("Failed to get user ID");
        }

        setAuthenticated(authenticated);
        // B7: cloud ops queued without an account tag (blank, or the device id
        // older builds used) are adopted by this account, as they'd have flushed
        // under it before the guard. Before the first queue drain.
        if (authenticated) {
          try {
            await migrateUntaggedCloudOps(sessionUserId);
          } catch {}
        }

        const [redisResult, supabaseResult] = await Promise.allSettled([
          noteOperation("redis", { operation: "getAll", userId: newUserId }),
          authenticated
            ? getSupabaseNotesByUserId()
            : Promise.resolve({ success: true, notes: [] }),
        ]);

        const redisOk =
          redisResult.status === "fulfilled" && redisResult.value.success;
        const redisNotes =
          redisOk && redisResult.value.notes
            ? redisResult.value.notes.map(redisToCombi)
            : [];

        const supabaseOk =
          supabaseResult.status === "fulfilled" && supabaseResult.value.success;
        const supabaseNotes =
          supabaseOk && supabaseResult.value.notes
            ? supabaseResult.value.notes
            : [];

        let allNotes: CombinedNote[] = [];
        if (redisOk) {
          allNotes.push(...redisNotes);
        } else {
          allNotes.push(...cachedNotes.filter((n) => n.source === "redis"));
        }
        if (supabaseOk) {
          allNotes.push(...supabaseNotes);
        } else if (authenticated) {
          allNotes.push(...cachedNotes.filter((n) => n.source === "supabase"));
        }

        localStorage.setItem(HAS_INITIALISED_KEY, "true");

        // NOTE: we deliberately do NOT delete "empty default" notes on startup
        // any more. That cleanup deleted a note server-side and then overwrote
        // the IDB cache with the reduced list — so a just-created note whose
        // typed content hadn't durably reached the server at load time (default
        // title + momentarily-empty body) was destroyed on reload, losing a
        // guest's writing. An empty starter note persisting is a harmless
        // cosmetic issue; deleting real content is not. Keep every note.

        const normalizedNotes = normaliseOrdering(allNotes);
        const sortedNotes = sortNotes(normalizedNotes, null);
        const [pendingContent, notToWrite] = await Promise.all([
          getPendingContentByNote(),
          notesNotToWrite(),
        ]);
        // Sources fetched from the server this load whose cache this device
        // hasn't checked for pre-`localEdit` records yet (one time per device).
        const legacyPending = legacyCacheSourcesPending();
        const legacyCacheSources = new Set<NoteSource>(
          [...legacyPending].filter((s) => (s === "redis" ? redisOk : authenticated && supabaseOk)),
        );
        const { merged: reconciled, legacyCopies } = mergeLocalWithServer(
          sortedNotes,
          cachedNotes,
          newUserId,
          authenticated,
          pendingContent,
          notToWrite,
          legacyCacheSources,
        );
        // A queued edit whose cached copy was overwritten (e.g. by another tab's
        // refresh racing the close) still wins over the server; the drain below
        // pushes it. Notes an editor owns are left to that editor.
        const { notes: mergedNotes } = protectUnsyncedLocal(
          reconciled,
          [],
          pendingContent,
          notToWrite,
        );

        // Commit — never a blind replace: mergedNotes was built from data read
        // before the user may have created/edited/removed notes during the load
        // (Ctrl+J right after open). Lay those actions back over it, then apply
        // the refresh's in-flight rule (mergeWithBackend). Read + set happen in
        // the same tick, so nothing can slip in between.
        mergeWithBackend(
          keepChangesMadeDuringLoad(
            mergedNotes,
            loadBaseline,
            useNotesStore.getState().notes,
            loadStartedAt,
          ),
        );
        recalculateNotebookCounts();
        // Cache the store's result (as refresh does), not the pre-load list.
        const cacheWritten = saveAllNotesToLocal(useNotesStore.getState().notes).catch(() => {});
        // One-time legacy check done once its copies have landed. A copy that
        // didn't land: put the old record back in the cache (the write above
        // replaced it) and leave that source unmarked, so the next load retries.
        if (legacyCacheSources.size) {
          legacyCopies
            .then(async (failed) => {
              await cacheWritten;
              for (const n of failed) await saveNoteToLocal(n).catch(() => {});
              const failedSources = new Set(failed.map((n) => n.source));
              for (const s of legacyCacheSources) if (!failedSources.has(s)) markLegacyCacheChecked(s);
            })
            .catch(() => {});
        }

        // Mark as initialised only after successful completion
        hasInitialisedRef.current = true;
        initRetryCount.current = 0;

        // Drain any pending offline writes to the server rather than discarding
        // them. Queued ops are edits that never reached the cloud; clearing here
        // (the old behaviour) silently lost offline work when a reload out-raced
        // the queue. processQueue removes each op only after it succeeds.
        processQueue().catch(() => {});
      } catch (error) {
        console.error("Initialization error:", error);
        // Schedule retry with exponential backoff
        if (isMounted.current && initRetryCount.current < INIT_RETRY_DELAYS.length) {
          const delay = INIT_RETRY_DELAYS[initRetryCount.current];
          initRetryCount.current += 1;
          initRetryTimer.current = setTimeout(() => {
            if (isMounted.current && !hasInitialisedRef.current) {
              isInitializingRef.current = false;
              initialize();
            }
          }, delay);
        }
      } finally {
        isInitializingRef.current = false;
        setLoading(false);
        // Release the editor hydration lock once we've reconciled with the
        // server (or exhausted the attempt, so offline users aren't locked out).
        useNotesStore.getState().setServerSynced(true);
      }
    };

    initialize();

    return () => {
      if (initRetryTimer.current) {
        clearTimeout(initRetryTimer.current);
      }
    };
  }, [supabase, syncFromBackend, mergeWithBackend, setLoading, setUserId, setAuthenticated, recalculateNotebookCounts]);

  // Auth change listener
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_: string, session: any) => {
        const wasAuthenticated = useNotesStore.getState().isAuthenticated;
        const nowAuthenticated = !!session?.user;

        // The queue and the cache follow the account: on a sign-out (expired or
        // revoked session, failed token refresh, or chosen) that account's
        // queued edits and cached notes are PARKED, never wiped — they're
        // simply out of scope while it's signed out, and replay through the CAS
        // when it signs back in. A chosen sign-out clears that account's data
        // itself, after syncing or the user's say-so (utils/sign-out.ts).
        setActiveSupabaseUser(session?.user?.id ?? null);
        setAuthenticated(nowAuthenticated);

        if (hasInitialisedRef.current && wasAuthenticated !== nowAuthenticated) {
          await refreshNotes();
          // Back from a sign-out: send what was parked for this account.
          if (nowAuthenticated) processQueue().catch(() => {});

          // Clean up empty default notes when logging in
          if (!wasAuthenticated && nowAuthenticated) {
            const currentNotes = useNotesStore.getState().notes;
            const emptyDefaults = currentNotes.filter(isEmptyDefaultNote);
            if (emptyDefaults.length > 0) {
              const filtered = currentNotes.filter((n) => !isEmptyDefaultNote(n));
              syncFromBackend(filtered);
              recalculateNotebookCounts();

              for (const note of emptyDefaults) {
                const currentUserId = useNotesStore.getState().userId;
                if (currentUserId) {
                  noteOperation("redis", { operation: "delete", userId: currentUserId, noteId: note.id }).catch(() => {});
                }
              }
            }
          }
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase, refreshNotes, setAuthenticated, syncFromBackend, recalculateNotebookCounts]);

  // Supabase Realtime — listen for cross-device changes to cloud notes
  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel("notes-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `author=eq.${userId}`,
        },
        (payload: any) => {
          if (!isMounted.current) return;

          const { isEditing, isSaving, notes, optimisticUpdateNote, optimisticAddNote, optimisticDeleteNote } =
            useNotesStore.getState();

          if (payload.eventType === "UPDATE") {
            const updated = payload.new as SupabaseNote;
            // Skip if we're currently editing or saving this note (our own write)
            if (isEditing.has(updated.id) || isSaving.has(updated.id)) return;

            const combiNote = supabaseToCombi(updated);
            const existing = notes.find((n) => n.id === updated.id);
            if (!existing) return;

            // Apply only when the server VERSION is ahead of ours (not by
            // timestamp — a wrong clock must not flip this). We already skip
            // notes we're actively editing/saving above.
            if ((combiNote.version ?? 1) > (existing.version ?? 1)) {
              optimisticUpdateNote(updated.id, combiNote);
            }
          } else if (payload.eventType === "INSERT") {
            const inserted = payload.new as SupabaseNote;
            // Skip if we already have this note (our own create)
            if (notes.some((n) => n.id === inserted.id)) return;

            const combiNote = supabaseToCombi(inserted);
            optimisticAddNote(combiNote);
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old as { id: string };
            if (!deleted?.id) return;
            // Skip if we already removed it
            if (!notes.some((n) => n.id === deleted.id)) return;

            optimisticDeleteNote(deleted.id);
          }
        },
      )
      .subscribe((status: string, err?: Error) => {
        if (status === "SUBSCRIBED") {
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Realtime subscription error:", status, err);
          // Attempt reconnection after 5 seconds
          reconnectTimer = setTimeout(() => {
            if (isMounted.current) {
              channel.subscribe();
            }
          }, 5000);
        } else if (status === "CLOSED") {
        }
      });

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      supabase.removeChannel(channel);
    };
  }, [supabase, isAuthenticated, userId]);

  // Cross-device freshness (local/Redis notes have no realtime channel): poll
  // faster while the tab is VISIBLE, pause while hidden, and refresh immediately
  // on focus / becoming visible so a delete or edit made in another browser
  // shows up in seconds rather than after the slow background interval.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let lastRev = -1;
    let lastFull = 0;

    const canRefresh = () => {
      if (!hasInitialisedRef.current) return false;
      const { isEditing, isSaving } = useNotesStore.getState();
      return !(isEditing.size > 0 || isSaving.size > 0);
    };

    const fullRefresh = () => {
      if (!canRefresh()) return;
      if (Date.now() - lastFull < MIN_REFRESH_GAP) return;
      lastFull = Date.now();
      refreshNotes();
    };

    // Interval tick: do a CHEAP 1-command revision check and only fetch all
    // notes when the local (Redis) revision actually moved. A full refresh still
    // runs at least every REFRESH_INTERVAL as a fallback for cloud changes.
    const tick = async () => {
      if (!canRefresh()) return;
      if (Date.now() - lastFull >= REFRESH_INTERVAL) { fullRefresh(); return; }
      const uid = useNotesStore.getState().userId;
      if (!uid) return;
      try {
        const rev = await fetchNotesRevision(uid);
        if (lastRev !== -1 && rev !== lastRev) fullRefresh();
        lastRev = rev;
      } catch {
        /* ignore a failed cheap check */
      }
    };

    const start = () => {
      if (interval) return;
      interval = setInterval(tick, VISIBLE_REFRESH_INTERVAL);
    };
    const stop = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };

    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") { fullRefresh(); start(); }
      else stop();
    };
    const onFocus = () => fullRefresh();

    if (typeof document === "undefined" || document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshNotes]);

  // A replayed queued edit (or a reconcile / refresh push) met a newer server
  // version and was saved as a "(conflicted copy)" (the server note was kept).
  // Refresh so the copy shows.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onConflict = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        refreshNotes();
      }, 500);
    };
    const unsubscribe = subscribeConflicts(onConflict);
    pushConflictListeners.add(onConflict);
    return () => {
      unsubscribe();
      pushConflictListeners.delete(onConflict);
      if (timer) clearTimeout(timer);
    };
  }, [refreshNotes]);

  // Cross-tab: react to another tab's changes so this tab updates instantly
  // (instead of waiting for the periodic refresh). Covers saves, deletes and
  // list-level changes (restore / empty-trash / move to Local or Cloud).
  useEffect(() => {
    return subscribeNoteUpdates((msg) => {
      const store = useNotesStore.getState();

      if (msg.kind === "changed") {
        // Restore / empty-trash / transfer: refresh data only (no layout change).
        if (!(store.isEditing.size > 0 || store.isSaving.size > 0)) refreshNotes();
        return;
      }

      if (msg.kind === "deleted") {
        if (!msg.noteId) return;
        // Don't yank a note out from under active editing here.
        if (store.isEditing.has(msg.noteId) || store.isSaving.has(msg.noteId)) return;
        store.removeNote(msg.noteId);
        return;
      }

      // Content update.
      if (!msg.noteId) return;
      if (store.isEditing.has(msg.noteId) || store.isSaving.has(msg.noteId)) return;
      const existing = store.notes.find((n) => n.id === msg.noteId);
      if (!existing) return;
      const incomingV = msg.version ?? 0;
      const existingV = existing.version ?? 1;
      const contentChanged = typeof msg.content === "string" && msg.content !== existing.content;
      if (incomingV > existingV || contentChanged) {
        store.optimisticUpdateNote(msg.noteId, {
          content: typeof msg.content === "string" ? msg.content : existing.content,
          contentFormat: (msg.contentFormat as any) || existing.contentFormat,
          ...(typeof msg.version === "number" ? { version: msg.version } : {}),
        });
      }
    });
  }, [refreshNotes]);

  // Update last access on user activity (throttled to 5 minutes)
  useEffect(() => {
    // Same as the periodic refresh above: check the guard at event time, not at
    // effect-setup time, or the listeners are never attached (updateLastAccess is
    // stable, so this effect only runs once — while hasInitialisedRef is false).
    const throttledUpdateLastAccess = () => {
      if (!hasInitialisedRef.current) return;

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
      if (initRetryTimer.current) {
        clearTimeout(initRetryTimer.current);
      }
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
