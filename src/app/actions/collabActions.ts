"use server";

import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { ownerCanCollaborate } from "@/lib/subscription";
import { noteIsTrashed } from "@/lib/note-trash";

/**
 * Persistence for the collaborative Yjs document (design surface 05).
 * The Y.Doc state (base64) is the source of truth for a shared note; every
 * client loads the SAME state and merges deltas, so no re-seeding / duplication.
 * Access is derived from the server session, not client-passed ids.
 */

type Target = { noteId?: string; shortcode?: string };

async function sessionUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// Resolve the target note + whether the caller may read / write its doc.
// `needWrite` lets a read-only caller (loadCollabDoc) skip the owner
// collaboration-plan check, which is only relevant to WRITE access.
async function resolve(
  target: Target,
  needWrite = true,
): Promise<{
  noteId: string | null;
  canRead: boolean;
  canWrite: boolean;
}> {
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
    // only needed when the caller intends to WRITE. loadCollabDoc skips it (it
    // only uses canRead), saving two queries on the hot read path.
    if (canWrite && needWrite && !(await ownerCanCollaborate(svc, share.note_id))) {
      canWrite = false;
    }
    return { noteId: share.note_id, canRead, canWrite };
  }

  return { noteId: null, canRead: false, canWrite: false };
}

export async function loadCollabDoc(target: Target): Promise<{ state: string | null }> {
  const { noteId, canRead } = await resolve(target, false);
  if (!noteId || !canRead) return { state: null };
  const svc = createServiceRoleClient();
  const { data } = await svc.from("note_ydoc").select("state").eq("note_id", noteId).maybeSingle();
  return { state: (data as any)?.state ?? null };
}

export async function saveCollabDoc(target: Target & { state: string }): Promise<{ ok: boolean }> {
  const { noteId, canWrite } = await resolve(target);
  if (!noteId || !canWrite || !target.state) return { ok: false };
  const svc = createServiceRoleClient();
  const { error } = await svc
    .from("note_ydoc")
    .upsert(
      { note_id: noteId, state: target.state, updated_at: new Date().toISOString() } as any,
      { onConflict: "note_id" },
    );
  return { ok: !error };
}
