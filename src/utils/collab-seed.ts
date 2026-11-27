import * as Y from "yjs";
import type { Node as ProseNode } from "@milkdown/prose/model";
import { prosemirrorToYXmlFragment } from "y-prosemirror";
import { COLLAB_FRAGMENT } from "./collab-doc";

// A Yjs client id (uint32) derived from the note and the text being seeded.
// FNV-1a; 0 is avoided only for readability in dumps.
export function seedClientId(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h || 1;
}

// Fill a blank collab doc from the note's text, DETERMINISTICALLY: the seed is
// built in a scratch doc whose client id comes from (note, text), so two
// clients that seed the same note from the same text at the same moment create
// identical Yjs items (same ids, same content), and merging them — peer to
// peer or in the server's stored doc — keeps one copy, not two. This is what
// lets a client seed as soon as its load says "no doc yet", instead of waiting
// a grace period and electing a single seeder.
//
// A blank-but-not-empty fragment (an empty paragraph persisted long ago) is
// cleared first so the seed doesn't sit under a stray empty line.
export function seedCollabDoc(doc: Y.Doc, node: ProseNode, roomKey: string, text: string, origin: unknown = "seed"): void {
  const frag = doc.getXmlFragment(COLLAB_FRAGMENT);
  if (frag.length > 0) doc.transact(() => frag.delete(0, frag.length), origin);
  const scratch = new Y.Doc();
  scratch.clientID = seedClientId(`${roomKey}\u0000${text}`);
  prosemirrorToYXmlFragment(node, scratch.getXmlFragment(COLLAB_FRAGMENT));
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(scratch), origin);
  scratch.destroy();
}
