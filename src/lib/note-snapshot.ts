import { isMajorShrink } from "@/lib/content-shrink";

// Snapshot a note's CURRENT server body into Version history, authored as the
// note's owner (so the owner's history lists it, whoever's save triggered it).
// `reason` keeps it out of the autosave prune, which only ever evicts routine
// autosaves. Best-effort: history must never block or fail a write.
export type SnapshotReason = "legacy" | "delete" | "conflict" | "safety";

export async function snapshotBody(client: any, noteId: string, reason: SnapshotReason): Promise<void> {
  try {
    const { data: cur } = await client
      .from("notes")
      .select("author, title, content, content_format, version")
      .eq("id", noteId)
      .maybeSingle();
    if (!cur) return;
    await client.from("note_versions").insert({
      note_id: noteId,
      author: cur.author,
      title: cur.title ?? "",
      content: cur.content ?? "",
      content_format: cur.content_format || "markdown",
      reason,
      note_version: cur.version ?? null,
    });
  } catch {
    /* history is best-effort */
  }
}

// The content-save half of the safety net (lib/content-shrink.ts): before a
// save replaces `before` with `after`, snapshot the body if that removes most
// of it. Call with the server's current content, before writing.
export async function snapshotIfMajorShrink(
  client: any,
  noteId: string,
  before: string | null | undefined,
  after: string | null | undefined,
): Promise<boolean> {
  if (!isMajorShrink(before, after)) return false;
  await snapshotBody(client, noteId, "safety");
  return true;
}
