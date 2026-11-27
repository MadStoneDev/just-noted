import * as Y from "yjs";

// Yjs only (no y-prosemirror): the server imports this for the merge's text
// check, and y-prosemirror would load a second copy of Yjs there. The seed,
// which needs y-prosemirror, is in collab-seed.ts (client side).

// The fragment milkdown's collab plugin binds the editor to.
export const COLLAB_FRAGMENT = "prosemirror";

// The visible text of a collaborative ProseMirror document (tags and entity
// refs stripped). Used for blankness and for the server's shrink check.
export function collabDocText(doc: Y.Doc): string {
  return doc
    .getXmlFragment(COLLAB_FRAGMENT)
    .toString()
    .replace(/<[^>]*>/g, "") // strip XML tags, leaving text content
    .replace(/&[a-z#0-9]+;/gi, ""); // drop entity refs (e.g. &nbsp;)
}

// Is the collaborative ProseMirror document visibly empty — no text at all?
//
// We can't use the XmlFragment's child COUNT for this: an "empty" editor is
// still one empty paragraph node (length 1), and a doc that was once persisted
// blank keeps that empty paragraph. Checking the count treated such a doc as
// "not empty", so seeding/recovery never fired and the body stayed blank even
// though notes.content still held the text. Instead we look at the actual text.
//
// Uncertainty resolves to NOT blank: that way we never duplicate-seed over a
// doc that might hold real content (the worse failure), and never block a real
// edit from persisting. The length-0 fast path still catches a truly fresh doc.
export function collabDocIsBlank(doc: Y.Doc): boolean {
  try {
    const frag = doc.getXmlFragment(COLLAB_FRAGMENT);
    if (frag.length === 0) return true;
    return collabDocText(doc).trim().length === 0;
  } catch {
    return false;
  }
}
