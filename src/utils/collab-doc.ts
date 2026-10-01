import * as Y from "yjs";

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
    const frag = doc.getXmlFragment("prosemirror");
    if (frag.length === 0) return true;
    const text = frag
      .toString()
      .replace(/<[^>]*>/g, "") // strip XML tags, leaving text content
      .replace(/&[a-z#0-9]+;/gi, "") // drop entity refs (e.g. &nbsp;)
      .trim();
    return text.length === 0;
  } catch {
    return false;
  }
}
