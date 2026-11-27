import * as Y from "yjs";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { collabDocIsStale, collabDocPlainText, collabDocText } from "@/utils/collab-doc";

// When the stored Yjs doc (note_ydoc) stops being the note's source of truth.
//
// The doc is only kept in step with the note's content while the note is
// collaborative (a "Can edit" link, or someone granted edit). Once it isn't,
// the owner edits in the plain editor and the doc goes stale; if the note is
// shared for editing again, the stale doc would load, win over the newer
// content, and its projection would write the old text back. So:
//   - unsharing (no edit access left) deletes the doc;
//   - an owner's plain save while the note isn't collaborative deletes it;
//   - a load that finds the content saved after the doc by a plain save
//     discards it (old docs, races) — the next client seeds from the content;
//   - every save that does go through the doc marks the doc as current
//     (touchCollabDoc), which is what lets the load tell the two apart.
//
// Service role throughout: note_ydoc has RLS on and no policies.

type Svc = ReturnType<typeof createServiceRoleClient>;

/** Anyone other than the owner can edit the note right now. Unsure → true. */
export async function noteIsCollaborative(svc: Svc, noteId: string): Promise<boolean> {
  try {
    const { data: shares, error } = await svc
      .from("shared_notes")
      .select("id, link_permission")
      .eq("note_id", noteId);
    if (error) return true;
    const rows = (shares ?? []) as { id: string; link_permission: string | null }[];
    if (rows.length === 0) return false;
    if (rows.some((s) => s.link_permission === "edit")) return true;
    const { data: editors, error: rErr } = await svc
      .from("shared_notes_readers")
      .select("id")
      .in(
        "shared_note",
        rows.map((s) => s.id),
      )
      .eq("role", "edit")
      .limit(1);
    if (rErr) return true;
    return (editors ?? []).length > 0;
  } catch {
    return true;
  }
}

export async function hasCollabDoc(svc: Svc, noteId: string): Promise<boolean> {
  try {
    const { data } = await svc.from("note_ydoc").select("note_id").eq("note_id", noteId).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/** Mark the doc as current with the note's content (no-op without a doc). */
export async function touchCollabDoc(svc: Svc, noteId: string): Promise<void> {
  try {
    await svc
      .from("note_ydoc")
      .update({ updated_at: new Date().toISOString() } as any)
      .eq("note_id", noteId);
  } catch {
    /* best effort: the load's grace window covers a missed touch */
  }
}

async function deleteCollabDoc(svc: Svc, noteId: string): Promise<void> {
  try {
    await svc.from("note_ydoc").delete().eq("note_id", noteId);
  } catch {
    /* a doc left behind is caught by the load-time check */
  }
}

/** After a sharing change: no edit access left → the doc goes. */
export async function dropCollabDocIfNotCollaborative(noteId: string): Promise<void> {
  const svc = createServiceRoleClient();
  if (!(await noteIsCollaborative(svc, noteId))) await deleteCollabDoc(svc, noteId);
}

/**
 * After the owner's content save landed. `viaDoc`: the text came from the doc
 * (a projection, or a background write merged into it). A plain save on a
 * note that is still collaborative also counts as current — the owner's
 * editor carries that text into the doc when it binds — while one on a note
 * that isn't means the doc no longer matches: it is deleted.
 */
export async function afterOwnerContentSave(noteId: string, viaDoc: boolean): Promise<void> {
  const svc = createServiceRoleClient();
  if (!(await hasCollabDoc(svc, noteId))) return;
  if (viaDoc || (await noteIsCollaborative(svc, noteId))) await touchCollabDoc(svc, noteId);
  else await deleteCollabDoc(svc, noteId);
}

/**
 * Load-time check: the stored doc, or null when there is none — or when it
 * was stale (see collabDocIsStale) and has just been discarded. A discarded
 * doc's text goes to the owner's Version history first (reason "safety").
 */
export async function readCurrentCollabDoc(
  svc: Svc,
  noteId: string,
): Promise<{ ok: true; state: string | null } | { ok: false }> {
  const [docRes, noteRes] = await Promise.all([
    svc.from("note_ydoc").select("state, updated_at").eq("note_id", noteId).maybeSingle(),
    svc.from("notes").select("author, title, content, updated_at, version").eq("id", noteId).maybeSingle(),
  ]);
  if (docRes.error) return { ok: false };
  const row = docRes.data as { state: string; updated_at: string } | null;
  if (!row) return { ok: true, state: null };
  const note = noteRes.data as
    | { author: string; title: string | null; content: string | null; updated_at: string | null; version: number | null }
    | null;
  if (!note) return { ok: true, state: row.state };

  let docText = "";
  let plain = "";
  try {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Uint8Array.from(Buffer.from(row.state, "base64")));
    docText = collabDocText(doc);
    plain = collabDocPlainText(doc);
    doc.destroy();
  } catch {
    return { ok: true, state: row.state };
  }
  if (!collabDocIsStale({ docText, docUpdatedAt: row.updated_at, content: note.content, noteUpdatedAt: note.updated_at })) {
    return { ok: true, state: row.state };
  }

  // Keep the doc's words, then drop it — only if nothing saved it meanwhile.
  if (plain.trim()) {
    try {
      await svc.from("note_versions").insert({
        note_id: noteId,
        author: note.author,
        title: note.title ?? "",
        content: plain,
        content_format: "markdown",
        reason: "safety",
        note_version: note.version ?? null,
      } as any);
    } catch {
      /* history is best-effort */
    }
  }
  console.warn(`[collab] discarded a stale doc: note=${noteId} doc=${row.updated_at} note=${note.updated_at}`);
  await svc.from("note_ydoc").delete().eq("note_id", noteId).eq("updated_at", row.updated_at);
  const { data: after, error } = await svc.from("note_ydoc").select("state").eq("note_id", noteId).maybeSingle();
  if (error) return { ok: false };
  return { ok: true, state: (after as any)?.state ?? null };
}
