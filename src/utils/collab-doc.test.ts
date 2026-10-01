import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { collabDocIsBlank } from "./collab-doc";

// Build a ProseMirror-shaped Yjs doc the way y-prosemirror does: a
// "prosemirror" XmlFragment of block XmlElements, each holding XmlText.
function makeDoc(build: (frag: Y.XmlFragment) => void): Y.Doc {
  const doc = new Y.Doc();
  const frag = doc.getXmlFragment("prosemirror");
  build(frag);
  return doc;
}

function para(text?: string): Y.XmlElement {
  const p = new Y.XmlElement("paragraph");
  if (text) {
    const t = new Y.XmlText();
    t.insert(0, text);
    p.push([t]);
  }
  return p;
}

function heading(text: string): Y.XmlElement {
  const h = new Y.XmlElement("heading");
  const t = new Y.XmlText();
  t.insert(0, text);
  h.push([t]);
  return h;
}

describe("collabDocIsBlank", () => {
  it("is blank for a fresh (empty) doc", () => {
    expect(collabDocIsBlank(makeDoc(() => {}))).toBe(true);
  });

  it("is blank for a single empty paragraph (the stuck-blank case)", () => {
    // This is exactly what a once-persisted-blank note_ydoc looks like — length
    // is 1, so the old count-based check wrongly treated it as non-empty.
    expect(collabDocIsBlank(makeDoc((f) => f.push([para()])))).toBe(true);
  });

  it("is NOT blank for a paragraph with text", () => {
    expect(collabDocIsBlank(makeDoc((f) => f.push([para("Hello world")])))).toBe(false);
  });

  it("is NOT blank for a rich doc (heading + list-ish paragraphs)", () => {
    const doc = makeDoc((f) => {
      f.push([heading("Paediatric Nurses")]);
      f.push([para("Routines and regulation.")]);
      f.push([para("- one")]);
      f.push([para("- two")]);
    });
    expect(collabDocIsBlank(doc)).toBe(false);
  });
});
