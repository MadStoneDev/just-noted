import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { Schema } from "@milkdown/prose/model";
import { collabDocIsBlank, collabDocText } from "./collab-doc";
import { seedCollabDoc, seedClientId } from "./collab-seed";

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

// A minimal ProseMirror schema for building seed nodes.
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    text: {},
  },
});
const pmDoc = (...lines: string[]) =>
  schema.node("doc", null, lines.map((l) => schema.node("paragraph", null, l ? [schema.text(l)] : [])));
const merge = (...docs: Y.Doc[]) => {
  const out = new Y.Doc();
  for (const d of docs) Y.applyUpdate(out, Y.encodeStateAsUpdate(d));
  return out;
};

describe("seedCollabDoc (deterministic first fill)", () => {
  const BODY = "Shared with B for collaboration specs.";

  it("two clients seeding the same note from the same text merge to ONE copy", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    seedCollabDoc(a, pmDoc(BODY, "second line"), "note-1", "md");
    seedCollabDoc(b, pmDoc(BODY, "second line"), "note-1", "md");
    expect(collabDocText(merge(a, b))).toBe(`${BODY}second line`);
    // …and in either order, and on top of later edits by one of them.
    ((a.getXmlFragment("prosemirror").get(0) as Y.XmlElement).get(0) as Y.XmlText).insert(0, "edited ");
    expect(collabDocText(merge(b, a))).toBe(`edited ${BODY}second line`);
  });

  it("different notes or different text seed under different client ids", () => {
    expect(seedClientId("note-1\u0000md")).not.toBe(seedClientId("note-2\u0000md"));
    expect(seedClientId("note-1\u0000one")).not.toBe(seedClientId("note-1\u0000two"));
    expect(seedClientId("x")).toBe(seedClientId("x"));
  });

  it("clears a blank-but-not-empty doc (stray empty paragraph) before seeding", () => {
    const d = makeDoc((f) => f.push([para()]));
    seedCollabDoc(d, pmDoc(BODY), "note-1", "md");
    expect(d.getXmlFragment("prosemirror").length).toBe(1);
    expect(collabDocText(d)).toBe(BODY);
  });

  it("never seeds under the doc's own client id (local edits stay distinct)", () => {
    const d = new Y.Doc();
    seedCollabDoc(d, pmDoc(BODY), "note-1", "md");
    const clients = [...Y.decodeStateVector(Y.encodeStateVector(d)).keys()];
    expect(clients).toEqual([seedClientId("note-1\u0000md")]);
    expect(clients).not.toContain(d.clientID);
  });
});
