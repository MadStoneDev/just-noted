"use server";

import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import {
  CombinedNote,
  combiToSupabase,
  supabaseToCombi,
} from "@/types/combined-notes";
import { validateGoalType, validateNoteTitle } from "@/utils/validation";
import { sameNoteContent } from "@/utils/notes-utils";
import { wouldBlankNonEmpty } from "@/lib/collab-guard";
import { snapshotBody, snapshotIfMajorShrink } from "@/lib/note-snapshot";
import type { SubscriptionTier } from "@/types/subscription";
import { resolvePlanTier } from "@/lib/subscription";
import {
  DEFAULT_SCRIBE_RETENTION_DAYS,
  isScribeRetentionDays,
  resolveRetentionDays,
} from "@/lib/retention";
import { LEGACY_VERSIONLESS_WRITES } from "@/constants/app";
import {
  decideBackgroundWrite,
  conflictCopyTitle,
  isValidConflictCopy,
  isBackgroundBase,
  type BackgroundBase,
  type ConflictCopySpec,
} from "@/utils/background-conflict";

// ===========================
// AUTHENTICATION HELPER
// ===========================
async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.getUser();

  if (error || !authData.user?.id) {
    throw new Error("User not authenticated");
  }

  return { supabase, userId: authData.user.id };
}

// ===========================
// LEGACY QUEUE ENTRIES
// ===========================
const NOTE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Owners of the given notes, as far as this session may read them (RLS: its
 * own notes), trashed ones included. For offline-queue entries queued by older
 * builds without an account tag: the client replays one only for the account
 * that owns its note. Notes this session can't read are simply absent — it
 * learns nothing about other accounts' notes.
 */
export const getCloudNoteOwners = async (
  noteIds: string[],
): Promise<{ success: true; owners: Record<string, string> } | { success: false; error: string }> => {
  try {
    const ids = [...new Set(noteIds)].filter((id) => typeof id === "string" && NOTE_ID_RE.test(id)).slice(0, 500);
    const { supabase } = await getAuthenticatedUser();
    if (ids.length === 0) return { success: true, owners: {} };
    const { data, error } = await supabase.from("notes").select("id, author").in("id", ids);
    if (error) return { success: false, error: error.message };
    const owners: Record<string, string> = {};
    for (const row of (data ?? []) as { id: string; author: string | null }[]) {
      if (row.author) owners[row.id] = row.author;
    }
    return { success: true, owners };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to look up note owners" };
  }
};

// ===========================
// NOTE OPERATIONS
// ===========================
export const createNote = async (newNote: Partial<CombinedNote>) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const supabaseNote = combiToSupabase({
      ...newNote,
      author: userId,
      goal_type: validateGoalType(newNote.goal_type),
    } as CombinedNote);

    const { data, error } = await supabase
      .from("notes")
      .insert(supabaseNote)
      .select()
      .single();

    if (error) {
      console.error("Failed to create note");
      return {
        success: false,
        error: "Failed to save note to database",
      };
    }

    return {
      success: true,
      note: supabaseToCombi(data),
    };
  } catch (error) {
    console.error("Exception creating note");
    return {
      success: false,
      error: "Failed to add note",
    };
  }
};

// ─── Phase 2: optimistic-concurrency helpers (non-exported; allowed in a
// "use server" file — only EXPORTS must be async functions) ────────────────

type UpdateNoteResult = {
  success: boolean;
  version?: number;
  conflict?: boolean;
  current?: CombinedNote | null;
  /** Background write: the server note was kept and this copy was made. */
  conflicted?: boolean;
  copyId?: string;
  error?: string;
};

// Snapshot the current server content to history BEFORE we overwrite it, so a
// legacy/version-less write never silently discards prior content. reason is
// preserved so the 50-entry prune only ever evicts routine autosaves.
async function snapshotCurrentContent(
  supabase: any,
  noteId: string,
  reason: "legacy" | "delete" | "conflict",
) {
  await snapshotBody(supabase, noteId, reason);
}

// Read the current version, then apply `fields` + version+1 conditional on that
// version (atomic per row), retrying if another writer raced. For writes that
// must always land (projection, legacy, delete/restore) rather than reject.
async function applyWithVersionBump(
  supabase: any,
  noteId: string,
  userId: string,
  fields: Record<string, unknown>,
): Promise<{ success: boolean; version?: number; error?: string }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: cur, error: readErr } = await supabase
      .from("notes")
      .select("version")
      .eq("id", noteId)
      .eq("author", userId)
      .maybeSingle();
    if (readErr) return { success: false, error: String(readErr.message || readErr) };
    if (!cur) return { success: false, error: "not_found" };
    const base = (cur as any).version ?? 1;
    const { data, error } = await supabase
      .from("notes")
      .update({ ...fields, version: base + 1, updated_at: new Date().toISOString() })
      .eq("id", noteId)
      .eq("author", userId)
      .eq("version", base)
      .select("version")
      .maybeSingle();
    if (error) return { success: false, error: String(error.message || error) };
    if (data) return { success: true, version: (data as any).version };
    // raced — re-read and retry
  }
  return { success: false, error: "retry_exhausted" };
}

// A projection write may skip CAS only when the note genuinely has a Yjs doc.
// note_ydoc is service-role only (RLS on, no policies), so the signed-in
// client always saw "no doc" here and every projection fell back to CAS —
// colliding with the collaborators' saves. The caller's own write is still
// author-scoped; this only reads whether the doc exists.
async function noteHasYdoc(_supabase: any, noteId: string): Promise<boolean> {
  try {
    const { data } = await createServiceRoleClient()
      .from("note_ydoc")
      .select("note_id")
      .eq("note_id", noteId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

// Background (unattended) CAS write — see utils/background-conflict.ts. The
// server note is never overwritten past `baseVersion`: on a conflict the
// incoming text is inserted as a "(conflicted copy)" note with the caller's
// fixed copy id, so a retried / duplicated write makes at most one copy.
// `base` is the version the text was edited from, or (queue entries from older
// builds) the time it was queued — see decideBackgroundWrite.
async function backgroundCasWrite(
  supabase: any,
  userId: string,
  noteId: string,
  fields: { content: string; content_format: string; goal: number; goal_type: string },
  base: BackgroundBase,
  copy: ConflictCopySpec,
): Promise<UpdateNoteResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: cur, error: readErr } = await supabase
      .from("notes")
      .select("*")
      .eq("id", noteId)
      .eq("author", userId)
      .maybeSingle();
    if (readErr) return { success: false, error: String(readErr.message || readErr) };
    if (!cur) return { success: false, error: "not_found" };
    const curVersion = (cur as any).version ?? 1;

    const decision = decideBackgroundWrite({
      base,
      serverVersion: curVersion,
      serverContent: (cur as any).content,
      serverDeleted: !!(cur as any).deleted_at,
      serverUpdatedAt: (cur as any).updated_at,
      content: fields.content,
    });

    if (decision === "noop") return { success: true, version: curVersion };

    if (decision === "apply") {
      await snapshotIfMajorShrink(supabase, noteId, (cur as any).content, fields.content);
      const { data, error } = await supabase
        .from("notes")
        .update({ ...fields, version: curVersion + 1, updated_at: new Date().toISOString() })
        .eq("id", noteId)
        .eq("author", userId)
        .eq("version", curVersion)
        .select("version")
        .maybeSingle();
      if (error) return { success: false, error: String(error.message || error) };
      if (data) return { success: true, version: (data as any).version };
      continue; // raced — re-read; it is now a copy or a no-op
    }

    const now = new Date().toISOString();
    const { error: insErr } = await supabase.from("notes").insert({
      id: copy.id,
      author: userId,
      title: conflictCopyTitle((cur as any).title, copy.stamp),
      content: fields.content,
      content_format: fields.content_format,
      goal: fields.goal,
      goal_type: fields.goal_type,
      is_pinned: false,
      is_private: (cur as any).is_private ?? true,
      is_collapsed: false,
      order: (cur as any).order ?? 0,
      notebook_id: (cur as any).notebook_id ?? null,
      version: 1,
      created_at: now,
      updated_at: now,
    });
    // 23505 = this copy already exists (the keepalive save made it, or an
    // earlier replay did and its response was lost). Same text — done.
    if (insErr && (insErr as any).code !== "23505") {
      return { success: false, error: String(insErr.message || insErr) };
    }
    return { success: true, version: curVersion, conflicted: true, copyId: copy.id };
  }
  return { success: false, error: "retry_exhausted" };
}

export const updateNote = async (
  noteId: string,
  content: string,
  wordCountGoal: number = 0,
  wordCountGoalType: string = "",
  opts?: {
    baseVersion?: number;
    projection?: boolean;
    allowLegacy?: boolean;
    /**
     * Background write (queue replay / tab-close save): on a conflict keep the
     * server note and save this text as the given conflicted copy instead.
     * Requires baseVersion, or `queuedAt` for a queue entry from an older
     * build that has no base version.
     */
    conflictCopy?: ConflictCopySpec;
    queuedAt?: number;
  },
): Promise<UpdateNoteResult> => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    if (opts?.conflictCopy !== undefined) {
      const base: unknown =
        opts.baseVersion !== undefined ? { version: opts.baseVersion } : { queuedAt: opts.queuedAt };
      if (!isValidConflictCopy(opts.conflictCopy) || !isBackgroundBase(base)) {
        return { success: false, error: "Invalid data" };
      }
      return await backgroundCasWrite(
        supabase,
        userId,
        noteId,
        {
          content,
          content_format: "markdown",
          goal: wordCountGoal || 0,
          goal_type: validateGoalType(wordCountGoalType),
        },
        base,
        opts.conflictCopy,
      );
    }

    const fields = {
      content,
      // The editor always emits Markdown; stamp it so legacy "html" flags don't
      // go stale and render Markdown as raw text in shared views.
      content_format: "markdown",
      goal: wordCountGoal || 0,
      goal_type: validateGoalType(wordCountGoalType),
    };

    // No-op safety net: if nothing actually changed — same body (ignoring only
    // line endings / trailing whitespace) and same goal — skip the write
    // entirely. No version bump, no updated_at change, no snapshot. This keeps a
    // mere note-open (whose editor re-serialisation can differ byte-for-byte)
    // from registering as an edit even if a client slips past the editor-side
    // baseline guard. Conservative by design: a false "changed" just does a
    // harmless extra save, a false "unchanged" would drop a real edit.
    {
      const { data: cur } = await supabase
        .from("notes")
        .select("content, version, goal, goal_type")
        .eq("id", noteId)
        .eq("author", userId)
        .maybeSingle();

      // Collab blank-guard: a projection of the shared Yjs doc must never blank a
      // note that still has content (e.g. the editor autosaving before the doc
      // has seeded). Keep the note as-is and report success. Mirrors the
      // shared-note save path (wouldBlankNonEmpty).
      if (opts?.projection && wouldBlankNonEmpty(content, (cur as any)?.content)) {
        return { success: true, version: (cur as any)?.version };
      }

      if (
        cur &&
        sameNoteContent((cur as any).content, content) &&
        ((cur as any).goal ?? 0) === fields.goal &&
        ((cur as any).goal_type ?? "") === fields.goal_type
      ) {
        return { success: true, version: (cur as any).version };
      }

      // Safety net: a save that removes most of the note (>50% shorter and
      // >200 characters gone) first puts the current body in Version history,
      // whichever write path below lands it (lib/content-shrink.ts).
      if (cur) await snapshotIfMajorShrink(supabase, noteId, (cur as any).content, content);
    }

    // Projection (Yjs-merged content) — bypass CAS ONLY when the note actually
    // has a collab doc. A client flag alone must never bypass conflict
    // protection on a private note (server-verified per audit condition #1).
    if (opts?.projection && (await noteHasYdoc(supabase, noteId))) {
      return await applyWithVersionBump(supabase, noteId, userId, fields);
    }

    // CAS: the client sent the base version it edited from.
    if (typeof opts?.baseVersion === "number") {
      const base = opts.baseVersion;
      const { data, error } = await supabase
        .from("notes")
        .update({ ...fields, version: base + 1, updated_at: new Date().toISOString() })
        .eq("id", noteId)
        .eq("author", userId)
        .eq("version", base)
        .select("version")
        .maybeSingle();
      if (error) throw error;
      if (data) return { success: true, version: (data as any).version };
      // Stale — hand back the current server note so the client resolves it.
      const { data: cur } = await supabase
        .from("notes")
        .select("*")
        .eq("id", noteId)
        .eq("author", userId)
        .maybeSingle();
      return { success: false, conflict: true, current: cur ? supabaseToCombi(cur as any) : null };
    }

    // Version-less write: an old client, or a pre-upgrade offline-queue op.
    if (LEGACY_VERSIONLESS_WRITES || opts?.allowLegacy) {
      console.warn(`[versionless-write] note=${noteId}`); // counted via logs
      await snapshotCurrentContent(supabase, noteId, "legacy");
      return await applyWithVersionBump(supabase, noteId, userId, fields);
    }

    return { success: false, error: "version_required" };
  } catch (error) {
    console.error("Failed to update note:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export const updateNoteTitle = async (noteId: string, title: string) => {
  try {
    if (!validateNoteTitle(title)) {
      return {
        success: false,
        error: "Invalid title: Title cannot be empty",
      };
    }

    const { supabase, userId } = await getAuthenticatedUser();

    const { error } = await supabase
      .from("notes")
      .update({
        title: title.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Failed to update note title:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note title: ${errorMessage}`,
    };
  }
};

export const getNoteById = async (noteId: string) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("id", noteId)
      .eq("author", userId)
      .is("deleted_at", null)
      .single();

    if (error) {
      console.error("Supabase query error:", error);
      throw error;
    }

    return { success: true, note: supabaseToCombi(data) };
  } catch (error) {
    console.error("Failed to get note:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to retrieve note: ${errorMessage}`,
    };
  }
};

export const getNotesByUserId = async () => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("author", userId)
      .is("deleted_at", null)
      .order("is_pinned", { ascending: false })
      .order("order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase query error:", error);
      throw error;
    }

    const notes = data.map(supabaseToCombi);

    return { success: true, notes };
  } catch (error) {
    console.error("Failed to get notes:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to retrieve notes: ${errorMessage}`,
    };
  }
};

export const updateNotePinStatus = async (
  noteId: string,
  isPinned: boolean,
) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { error } = await supabase
      .from("notes")
      .update({
        is_pinned: isPinned,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Failed to update pin status:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update pin status: ${errorMessage}`,
    };
  }
};

export const updateNotePrivacyStatus = async (
  noteId: string,
  isPrivate: boolean,
) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { error } = await supabase
      .from("notes")
      .update({
        is_private: isPrivate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Failed to update privacy status:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update privacy status: ${errorMessage}`,
    };
  }
};

export const updateNoteCollapsedStatus = async (
  noteId: string,
  isCollapsed: boolean,
) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { error } = await supabase
      .from("notes")
      .update({
        is_collapsed: isCollapsed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Failed to update collapsed status:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update collapsed status: ${errorMessage}`,
    };
  }
};

export const updateSupabaseNoteOrder = async (
  noteId: string,
  newOrder: number,
) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { error } = await supabase
      .from("notes")
      .update({
        order: newOrder,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Failed to update order:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update order: ${errorMessage}`,
    };
  }
};

export const deleteNote = async (noteId: string) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    // Soft delete — set deleted_at, and bump the version so the change follows
    // the same optimistic-concurrency rules (content stays in the row + history).
    const res = await applyWithVersionBump(supabase, noteId, userId, {
      deleted_at: new Date().toISOString(),
    });
    if (!res.success) return { success: false, error: res.error };
    return { success: true };
  } catch (error) {
    console.error("Failed to delete note:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to delete note: ${errorMessage}` };
  }
};

export const restoreNote = async (noteId: string) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const res = await applyWithVersionBump(supabase, noteId, userId, { deleted_at: null });
    if (!res.success) return { success: false, error: res.error };
    return { success: true };
  } catch (error) {
    console.error("Failed to restore note:", error);
    return { success: false, error: String(error) };
  }
};

export const permanentlyDeleteNote = async (noteId: string) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { error } = await supabase
      .from("notes")
      .delete()
      .eq("id", noteId)
      .eq("author", userId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error("Failed to permanently delete note:", error);
    return { success: false, error: String(error) };
  }
};

export const getTrashedNotes = async () => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("author", userId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (error) throw error;
    return { success: true, notes: data || [] };
  } catch (error) {
    console.error("Failed to get trashed notes:", error);
    return { success: false, notes: [] };
  }
};

/**
 * Trash retention context for the current viewer. Guests aren't authenticated
 * (their notes live in Redis and are hard-deleted), so they get
 * `authenticated: false` and the Trash view nudges them to sign up.
 */
export const getTrashState = async () => {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user?.id) {
    return { authenticated: false as const };
  }

  const { data } = await supabase
    .from("subscriptions")
    .select("tier, status, plan_source, comp_until, trash_retention_days, current_period_end")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  const sub = data as
    | {
        tier?: string;
        status?: string;
        plan_source?: string | null;
        comp_until?: string | null;
        trash_retention_days?: number;
        current_period_end?: string | null;
      }
    | null;
  const tier: SubscriptionTier = resolvePlanTier(sub);
  const isScribe = tier === "scribe";
  const scribePref = isScribeRetentionDays(sub?.trash_retention_days)
    ? sub!.trash_retention_days!
    : DEFAULT_SCRIBE_RETENTION_DAYS;

  // Downgrade grace: a lapsed Scribe keeps the (now 30-day) Draft window
  // measured from when paid access ended (current_period_end), not from each
  // note's deletion. So notes trashed under a longer Scribe window get at least
  // 30 more days from the downgrade date instead of being purged early. Null for
  // active Scribe and for anyone who never subscribed.
  const graceAnchor = !isScribe && sub?.current_period_end
    ? sub.current_period_end
    : null;

  return {
    authenticated: true as const,
    tier,
    retentionDays: resolveRetentionDays(tier, scribePref),
    scribeRetentionPref: scribePref,
    graceAnchor,
  };
};

/**
 * Set the Scribe-only Trash retention preference (60 or 90 days). Written with
 * the service-role client (subscriptions rows are otherwise webhook-managed),
 * but only after authenticating the user and confirming they're on Scribe.
 */
export const setScribeRetentionDays = async (days: number) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    if (!isScribeRetentionDays(days)) {
      return { success: false, error: "Retention must be 60 or 90 days" };
    }

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("tier, status")
      .eq("user_id", userId)
      .maybeSingle();
    const s = sub as { tier?: string; status?: string } | null;
    const isScribe =
      (s?.status === "active" || s?.status === "trialing") &&
      s?.tier === "scribe";
    if (!isScribe) {
      return { success: false, error: "Retention length is a Scribe feature" };
    }

    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("subscriptions")
      .update({ trash_retention_days: days })
      .eq("user_id", userId);
    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Failed to set retention:", error);
    return { success: false, error: String(error) };
  }
};

export const getNoteMetadataByUserId = async () => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { data, error } = await supabase
      .from("notes")
      .select("id, title, author, is_pinned, is_private, is_collapsed, order, goal, goal_type, notebook_id, created_at, updated_at")
      .eq("author", userId)
      .order("is_pinned", { ascending: false })
      .order("order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase metadata query error:", error);
      throw error;
    }

    const notes = data.map((row: any) => supabaseToCombi({ ...row, content: "" }));
    return { success: true, notes };
  } catch (error) {
    console.error("Failed to get note metadata:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to retrieve note metadata: ${errorMessage}`,
    };
  }
};

export const getNoteContentsByUserId = async () => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { data, error } = await supabase
      .from("notes")
      .select("id, content")
      .eq("author", userId);

    if (error) {
      console.error("Supabase contents query error:", error);
      throw error;
    }

    return { success: true, contents: data as { id: string; content: string }[] };
  } catch (error) {
    console.error("Failed to get note contents:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to retrieve note contents: ${errorMessage}`,
    };
  }
};

export const batchUpdateNoteOrders = async (
  updates: { id: string; order: number }[],
) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const updatePromises = updates.map(({ id, order }) =>
      supabase
        .from("notes")
        .update({
          order,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("author", userId),
    );

    const results = await Promise.allSettled(updatePromises);

    const failures = results.filter((result) => result.status === "rejected");

    if (failures.length > 0) {
      console.error("Some order updates failed:", failures);
      return {
        success: false,
        error: `${failures.length} order updates failed`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to batch update orders:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update orders: ${errorMessage}`,
    };
  }
};
