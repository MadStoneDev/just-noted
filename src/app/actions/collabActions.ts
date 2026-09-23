"use server";

import { createClient, createServiceRoleClient } from "@/utils/supabase/server";

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
async function resolve(target: Target): Promise<{
  noteId: string | null;
  canRead: boolean;
  canWrite: boolean;
}> {
  const svc = createServiceRoleClient();
  const userId = await sessionUserId();

  // Owner path — they own the note outright.
  if (target.noteId) {
    if (!userId) return { noteId: target.noteId, canRead: false, canWrite: false };
    const { data: note } = await svc.from("notes").select("author").eq("id", target.noteId).maybeSingle();
    const owns = (note as any)?.author === userId;
    return { noteId: target.noteId, canRead: owns, canWrite: owns };
  }

  // Collaborator path — via a share shortcode.
  if (target.shortcode) {
    const { data: share } = await svc
      .from("shared_notes")
      .select("id, note_id, is_public, link_permission, storage, expires_at")
      .eq("shortcode", target.shortcode)
      .maybeSingle();
    if (!share) return { noteId: null, canRead: false, canWrite: false };
    if ((share as any).storage !== "supabase") return { noteId: (share as any).note_id, canRead: false, canWrite: false };
    if ((share as any).expires_at && new Date((share as any).expires_at) < new Date()) {
      return { noteId: (share as any).note_id, canRead: false, canWrite: false };
    }

    let reader: { role?: string } | null = null;
    if (userId) {
      const { data } = await svc
        .from("shared_notes_readers")
        .select("role")
        .eq("shared_note", (share as any).id)
        .eq("reader_id", userId)
        .maybeSingle();
      reader = (data as any) ?? null;
    }
    const canRead = !!(share as any).is_public || !!reader;
    const canWrite =
      !!userId && ((share as any).link_permission === "edit" || reader?.role === "edit");
    return { noteId: (share as any).note_id, canRead, canWrite };
  }

  return { noteId: null, canRead: false, canWrite: false };
}

export async function loadCollabDoc(target: Target): Promise<{ state: string | null }> {
  const { noteId, canRead } = await resolve(target);
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
