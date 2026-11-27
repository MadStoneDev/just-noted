import * as Y from "yjs";
import { collabDocText } from "@/utils/collab-doc";
import { isMajorShrink } from "@/lib/content-shrink";

// Server-side persistence of the collaborative Yjs doc: MERGE, never replace.
//
// A client's save used to upsert its full state over the stored one, so a
// client whose doc never loaded (failed request) replaced the shared doc for
// every collaborator with whatever it had typed. Now the incoming update is
// applied into the stored doc (Y.applyUpdate — a CRDT merge, not text
// concatenation): text the client never saw is kept, and its deletions only
// remove items it actually saw. Writes are compare-and-swap on updated_at, so
// two clients saving at once both land: the loser re-reads and merges again.
//
// The merged state goes back to the saving client, which applies it: a client
// that missed some of a peer's realtime updates (broadcast has no replay, and
// fast typing can exceed the channel's message rate) converges on every save,
// not only on the next resync.

const b64ToBytes = (b64: string) => Uint8Array.from(Buffer.from(b64, "base64"));
const bytesToB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

export interface MergeResult {
  merged: string;
  changed: boolean; // false: the incoming update added nothing to the stored doc
  beforeText: string;
  afterText: string;
}

export function mergeCollabState(stored: string | null, incoming: string): MergeResult {
  const doc = new Y.Doc();
  try {
    if (stored) Y.applyUpdate(doc, b64ToBytes(stored));
    const beforeText = collabDocText(doc);
    const beforeSv = Y.encodeStateVector(doc);
    const beforeDs = Y.encodeStateAsUpdate(doc, Y.encodeStateVector(doc)); // the delete set only
    Y.applyUpdate(doc, b64ToBytes(incoming));
    const sameSv = Buffer.compare(Buffer.from(beforeSv), Buffer.from(Y.encodeStateVector(doc))) === 0;
    const sameDs = Buffer.compare(Buffer.from(beforeDs), Buffer.from(Y.encodeStateAsUpdate(doc, Y.encodeStateVector(doc)))) === 0;
    return {
      merged: bytesToB64(Y.encodeStateAsUpdate(doc)),
      changed: !stored || !(sameSv && sameDs),
      beforeText,
      afterText: collabDocText(doc),
    };
  } finally {
    doc.destroy();
  }
}

// The slice of the Supabase client this needs (service-role in production).
export interface CollabStore {
  read(noteId: string): Promise<{ state: string; updatedAt: string } | null>;
  /** Insert when no row exists; false if a row appeared meanwhile. */
  insert(noteId: string, state: string): Promise<boolean>;
  /** Update only if the row is still at `updatedAt`; false if it moved. */
  update(noteId: string, state: string, updatedAt: string): Promise<boolean>;
}

export async function persistCollabState(
  store: CollabStore,
  noteId: string,
  incoming: string,
  onMajorShrink?: () => Promise<void>,
  attempts = 6,
): Promise<{ ok: boolean; state?: string }> {
  let snapshotted = false;
  for (let i = 0; i < attempts; i++) {
    const row = await store.read(noteId);
    const m = mergeCollabState(row?.state ?? null, incoming);
    if (row && !m.changed) return { ok: true, state: row.state };
    if (!snapshotted && onMajorShrink && isMajorShrink(m.beforeText, m.afterText)) {
      snapshotted = true;
      try {
        await onMajorShrink();
      } catch {
        /* history is best-effort; never block the save on it */
      }
    }
    const ok = row ? await store.update(noteId, m.merged, row.updatedAt) : await store.insert(noteId, m.merged);
    if (ok) return { ok: true, state: m.merged };
    // Raced with another save: re-read and merge again.
  }
  return { ok: false };
}
