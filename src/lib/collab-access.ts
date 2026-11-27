import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { ownerCanCollaborate } from "@/lib/subscription";
import { noteIsTrashed } from "@/lib/note-trash";
import { persistCollabState, type CollabStore } from "@/lib/collab-merge";
import { snapshotBody } from "@/lib/note-snapshot";

// Access + persistence helpers for the collaborative Yjs document (design
// surface 05). Plain server functions (NOT "use server" actions) so they can be
// called from BOTH server actions (saveCollabDoc) and a Route Handler (the
// read). Serving the read from a route handler keeps it OFF the Next.js
// server-action queue (actions run one-at-a-time) — otherwise opening a note
// stalls the collab load behind every other action in flight.

export type CollabTarget = { noteId?: string; shortcode?: string };

async function sessionUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// Resolve the target note + whether the caller may read / write its doc.
// `needWrite` lets a read-only caller skip the owner collaboration-plan check,
// which is only relevant to WRITE access.
export async function resolveCollabTarget(
  target: CollabTarget,
  needWrite = true,
): Promise<{ noteId: string | null; canRead: boolean; canWrite: boolean }> {
  const svc = createServiceRoleClient();

  // Owner path — they own the note outright. Auth + the note row are independent.
  if (target.noteId) {
    const [userId, noteRes] = await Promise.all([
      sessionUserId(),
      svc.from("notes").select("author").eq("id", target.noteId).maybeSingle(),
    ]);
    if (!userId) return { noteId: target.noteId, canRead: false, canWrite: false };
    const owns = (noteRes.data as any)?.author === userId;
    // A trashed note's collab doc is not loadable/persistable (A4).
    if (owns && (await noteIsTrashed(svc, target.noteId))) {
      return { noteId: target.noteId, canRead: false, canWrite: false };
    }
    return { noteId: target.noteId, canRead: owns, canWrite: owns };
  }

  // Collaborator path — via a share shortcode. Auth + the share row don't depend
  // on each other, so fetch them together.
  if (target.shortcode) {
    const [userId, shareRes] = await Promise.all([
      sessionUserId(),
      svc
        .from("shared_notes")
        .select("id, note_id, is_public, link_permission, storage, expires_at")
        .eq("shortcode", target.shortcode)
        .maybeSingle(),
    ]);
    const share = shareRes.data as any;
    if (!share) return { noteId: null, canRead: false, canWrite: false };
    if (share.storage !== "supabase") return { noteId: share.note_id, canRead: false, canWrite: false };
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return { noteId: share.note_id, canRead: false, canWrite: false };
    }

    // The reader row and the trash check both key off the share — run together.
    const [readerRes, trashed] = await Promise.all([
      userId
        ? svc
            .from("shared_notes_readers")
            .select("role")
            .eq("shared_note", share.id)
            .eq("reader_id", userId)
            .maybeSingle()
        : Promise.resolve({ data: null } as { data: { role?: string } | null }),
      noteIsTrashed(svc, share.note_id),
    ]);
    // A trashed note is unreachable for collaborators too (A4).
    if (trashed) return { noteId: share.note_id, canRead: false, canWrite: false };

    const reader = (readerRes.data as any) ?? null;
    const canRead = !!share.is_public || !!reader;
    let canWrite = !!userId && (share.link_permission === "edit" || reader?.role === "edit");
    // Enforce-at-read downgrade gate (owner must be on a collaboration plan) —
    // only needed when the caller intends to WRITE; the read path skips it.
    if (canWrite && needWrite && !(await ownerCanCollaborate(svc, share.note_id))) {
      canWrite = false;
    }
    return { noteId: share.note_id, canRead, canWrite };
  }

  return { noteId: null, canRead: false, canWrite: false };
}

/**
 * Load the persisted Yjs state for a target the caller may read.
 *   { ok: true, state }       — state is the stored doc, or null: NO doc yet
 *   { ok: false, reason }     — no access, or the read failed
 * The two must never be confused: a client that took a failed read for "no
 * doc yet" would seed a fresh doc and (with the merge below) add a second copy
 * of the body, or (before the merge) replace the shared doc outright.
 */
export type CollabLoad = { ok: true; state: string | null } | { ok: false; reason: "forbidden" | "error" };

export async function loadCollabState(target: CollabTarget): Promise<CollabLoad> {
  const { noteId, canRead } = await resolveCollabTarget(target, false);
  if (!noteId || !canRead) return { ok: false, reason: "forbidden" };
  const svc = createServiceRoleClient();
  const { data, error } = await svc.from("note_ydoc").select("state").eq("note_id", noteId).maybeSingle();
  if (error) return { ok: false, reason: "error" };
  return { ok: true, state: (data as any)?.state ?? null };
}

/**
 * Persist the Yjs state for a target the caller may write: merged into the
 * stored doc (see lib/collab-merge.ts), never replacing it. A save that leaves
 * the doc's text less than half as long, with over 200 characters removed,
 * first snapshots the note's current body to Version history (lib/content-shrink).
 */
export async function saveCollabState(
  target: CollabTarget & { state: string },
): Promise<{ ok: boolean; state?: string }> {
  const { noteId, canWrite } = await resolveCollabTarget(target);
  if (!noteId || !canWrite || !target.state) return { ok: false };
  const svc = createServiceRoleClient();
  const store: CollabStore = {
    async read(id) {
      const { data, error } = await svc.from("note_ydoc").select("state, updated_at").eq("note_id", id).maybeSingle();
      if (error) throw error;
      return data ? { state: (data as any).state, updatedAt: (data as any).updated_at } : null;
    },
    async insert(id, state) {
      const { error } = await svc
        .from("note_ydoc")
        .insert({ note_id: id, state, updated_at: new Date().toISOString() } as any);
      if (error && (error as any).code === "23505") return false; // another save created it
      if (error) throw error;
      return true;
    },
    async update(id, state, updatedAt) {
      const { data, error } = await svc
        .from("note_ydoc")
        .update({ state, updated_at: new Date().toISOString() } as any)
        .eq("note_id", id)
        .eq("updated_at", updatedAt)
        .select("note_id");
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  };
  try {
    return await persistCollabState(store, noteId, target.state, () => snapshotBody(svc, noteId, "safety"));
  } catch {
    return { ok: false };
  }
}
