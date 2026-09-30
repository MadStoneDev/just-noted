// Bridges the collaborative editor and the chat panel (siblings that don't share
// a tree) by roomKey (= note id). The collab editor registers an anchor API;
// the chat panel captures the current selection as an anchor and scrolls to a
// message's anchor. Yjs RELATIVE positions survive concurrent edits; the stored
// quote is the fallback shown when a position can no longer be resolved.

export interface NoteAnchor {
  relStart: string; // base64 Yjs relative position
  relEnd: string;
  quote: string; // fallback text
}

export interface AnchorApi {
  /** The current editor selection as an anchor, or null (no/empty selection). */
  capture: () => NoteAnchor | null;
  /** Resolve + scroll/flash the anchor; false when it can't be resolved. */
  scrollTo: (anchor: NoteAnchor) => boolean;
}

const registry = new Map<string, AnchorApi>();

export function registerAnchorApi(roomKey: string, api: AnchorApi): () => void {
  registry.set(roomKey, api);
  return () => {
    if (registry.get(roomKey) === api) registry.delete(roomKey);
  };
}

export function getAnchorApi(roomKey: string): AnchorApi | null {
  return registry.get(roomKey) ?? null;
}
