import crypto from "node:crypto";
import * as Y from "yjs";
import { adminClient } from "./admin";
import type { SeededAccount } from "./auth";

// Shared-note helpers for the collaboration specs: a fresh note owned by
// `owner`, shared with `editor` as an editor (the same shape global-setup
// seeds), and the server's view of it — content and the stored Yjs doc's text.

export const SHARED_BODY = "Shared with B for collaboration specs.";

export async function makeSharedNote(owner: SeededAccount, editor: SeededAccount, opts: { share?: boolean; body?: string } = {}) {
  const db = adminClient();
  const title = `collab ${crypto.randomBytes(3).toString("hex")}`;
  const { data: note, error } = await db
    .from("notes")
    .insert({ author: owner.id, title, content: opts.body ?? SHARED_BODY })
    .select("id")
    .single();
  if (error || !note) throw new Error(`note: ${error?.message}`);
  const shortcode = Array.from(crypto.randomBytes(9), (n) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"[n % 52]).join("");
  if (opts.share !== false) {
    const { data: s, error: sErr } = await db
      .from("shared_notes")
      .insert({ note_id: note.id, note_owner_id: owner.id, shortcode, is_public: false, is_anonymous: false, storage: "supabase", link_permission: "view" })
      .select("id")
      .single();
    if (sErr || !s) throw new Error(`share: ${sErr?.message}`);
    const { error: rErr } = await db.from("shared_notes_readers").insert({ shared_note: s.id, reader_id: editor.id, reader_username: editor.handle, role: "edit" });
    if (rErr) throw new Error(`reader: ${rErr.message}`);
  }
  return { id: note.id as string, title, shortcode };
}

// The visible text of a stored Yjs doc (milkdown's collab fragment).
export function ydocText(b64: string): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Uint8Array.from(Buffer.from(b64, "base64")));
  return doc.getXmlFragment("prosemirror").toString().replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, "");
}

export async function serverNote(id: string) {
  const db = adminClient();
  const { data: n } = await db.from("notes").select("title, content, version").eq("id", id).maybeSingle();
  const { data: y } = await db.from("note_ydoc").select("state").eq("note_id", id).maybeSingle();
  return {
    content: ((n as any)?.content ?? "") as string,
    title: (n as any)?.title as string | undefined,
    doc: y ? ydocText((y as any).state) : null,
  };
}

export async function safetyVersions(id: string) {
  const { data } = await adminClient().from("note_versions").select("content, author, reason").eq("note_id", id).eq("reason", "safety");
  return (data ?? []) as { content: string; author: string; reason: string }[];
}
