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

// The doc's text with its blocks on separate lines: what a safety snapshot of
// a discarded doc keeps (formatting is lost, the words are not).
export function collabDocPlainText(doc: Y.Doc): string {
  const strip = (s: string) => s.replace(/<[^>]*>/g, "").replace(/&[a-z#0-9]+;/gi, "");
  return doc
    .getXmlFragment(COLLAB_FRAGMENT)
    .toArray()
    .map((block) => strip(block.toString()))
    .filter((line) => line.trim().length > 0)
    .join("\n\n");
}

// Letters and digits only, lower-cased: what the doc's text and the note's
// Markdown (or legacy HTML) have in common once markup is ignored. Link and
// image targets are dropped first, since the doc keeps them as attributes.
function comparableText(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images: alt and src are attributes in the doc
    .replace(/\]\([^)]*\)/g, "]") // link targets
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z#0-9]+;/gi, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Does the stored doc hold the same words as the note's content? */
export function collabDocMatchesContent(docText: string, content: string | null | undefined): boolean {
  return comparableText(docText) === comparableText(content ?? "");
}

/**
 * Content saved after the doc by a save that didn't go through the doc (the
 * owner editing while the note wasn't shared): the doc is stale, and loading
 * it would win over the newer text (its projection writes the old text back).
 *
 * Every save that does go through the doc (a projection, a collaborator's
 * save, a merged background write) moves the doc's updated_at past the note's,
 * so "the note is newer" means a plain save. Two guards keep a live doc safe:
 * the note must be newer by more than `graceMs` (the doc and its projection
 * land a moment apart), and its words must differ from the doc's (a title or
 * pin change also moves the note's updated_at, but not its words).
 */
export const STALE_DOC_GRACE_MS = 10_000;

export function collabDocIsStale(p: {
  docText: string;
  docUpdatedAt: string | null | undefined;
  content: string | null | undefined;
  noteUpdatedAt: string | null | undefined;
  graceMs?: number;
}): boolean {
  const doc = p.docUpdatedAt ? Date.parse(p.docUpdatedAt) : NaN;
  const note = p.noteUpdatedAt ? Date.parse(p.noteUpdatedAt) : NaN;
  if (Number.isNaN(doc) || Number.isNaN(note)) return false;
  if (note - doc <= (p.graceMs ?? STALE_DOC_GRACE_MS)) return false;
  return !collabDocMatchesContent(p.docText, p.content);
}
