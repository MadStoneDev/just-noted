import { describe, it, expect, vi } from "vitest";
import * as Y from "yjs";
import { mergeCollabState, persistCollabState, type CollabStore } from "./collab-merge";
import { collabDocText } from "@/utils/collab-doc";

// A ProseMirror-shaped doc: one paragraph per line, as y-prosemirror builds it.
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const state = (d: Y.Doc) => b64(Y.encodeStateAsUpdate(d));
const load = (s: string) => {
  const d = new Y.Doc();
  Y.applyUpdate(d, Uint8Array.from(Buffer.from(s, "base64")));
  return d;
};
function para(frag: Y.XmlFragment, text: string, at = frag.length) {
  const p = new Y.XmlElement("paragraph");
  const t = new Y.XmlText();
  t.insert(0, text);
  p.insert(0, [t]);
  frag.insert(at, [p]);
}
const textOf = (s: string) => collabDocText(load(s));
const frag = (d: Y.Doc) => d.getXmlFragment("prosemirror");
const firstText = (d: Y.Doc) => (frag(d).get(0) as Y.XmlElement).get(0) as Y.XmlText;

const BODY = "Shared with B for collaboration specs.";

// In-memory note_ydoc with the same compare-and-swap semantics as the
// Supabase-backed store. `beforeWrite` lets a test interleave another save.
function memoryStore(initial: string | null = null) {
  let row: { state: string; updatedAt: string } | null = initial ? { state: initial, updatedAt: "t0" } : null;
  let tick = 0;
  const writes: string[] = [];
  const hooks: { beforeWrite?: () => Promise<void> } = {};
  const store: CollabStore = {
    async read() {
      return row ? { ...row } : null;
    },
    async insert(_id, s) {
      await hooks.beforeWrite?.();
      if (row) return false;
      row = { state: s, updatedAt: `t${++tick}` };
      writes.push(s);
      return true;
    },
    async update(_id, s, at) {
      await hooks.beforeWrite?.();
      if (!row || row.updatedAt !== at) return false;
      row = { state: s, updatedAt: `t${++tick}` };
      writes.push(s);
      return true;
    },
  };
  return { store, hooks, writes, current: () => row?.state ?? null };
}

describe("collab doc save: Yjs merge into the stored doc, never replace", () => {
  it("a client whose doc never loaded (empty + typed) cannot wipe the stored body", () => {
    const stored = new Y.Doc();
    para(frag(stored), BODY);
    const stranger = new Y.Doc(); // failed load: fresh doc, then typing
    para(frag(stranger), " marker");
    const m = mergeCollabState(state(stored), state(stranger));
    expect(collabDocText(load(m.merged))).toContain(BODY);
    expect(collabDocText(load(m.merged))).toContain("marker");
    expect(m.changed).toBe(true);
  });

  it("deletions a client actually made still apply (it saw the text it removed)", () => {
    const stored = new Y.Doc();
    para(frag(stored), "keep this");
    para(frag(stored), "drop this");
    const client = load(state(stored));
    frag(client).delete(1, 1);
    const m = mergeCollabState(state(stored), state(client));
    expect(textOf(m.merged)).toBe("keep this");
  });

  it("an update with nothing new is not a change (no write)", async () => {
    const stored = new Y.Doc();
    para(frag(stored), BODY);
    const same = load(state(stored));
    expect(mergeCollabState(state(stored), state(same)).changed).toBe(false);
    const mem = memoryStore(state(stored));
    expect(await persistCollabState(mem.store, "n", state(same))).toMatchObject({ ok: true });
    expect(mem.writes).toHaveLength(0);
  });

  it("two clients' concurrent edits both survive, even when their saves race", async () => {
    const base = new Y.Doc();
    para(frag(base), BODY);
    const mem = memoryStore(state(base));

    // Both clients load the same stored doc, then edit different places.
    const a = load(state(base));
    const b = load(state(base));
    firstText(a).insert(0, "A-edit ");
    para(frag(b), "B-edit");

    // A's save reads the row, then B's whole save lands before A writes, so
    // A's compare-and-swap fails and A must re-read and merge again.
    let interleaved = false;
    mem.hooks.beforeWrite = async () => {
      if (interleaved) return;
      interleaved = true;
      const saveB = persistCollabState(mem.store, "n", state(b));
      expect(await saveB).toMatchObject({ ok: true });
    };
    expect(await persistCollabState(mem.store, "n", state(a))).toMatchObject({ ok: true });

    const final = textOf(mem.current()!);
    expect(final).toContain("A-edit");
    expect(final).toContain("B-edit");
    expect(final).toContain(BODY);
    expect(mem.writes).toHaveLength(2); // B, then A's retried merge
  });

  it("returns the merged state, so a client that missed a peer's updates converges", async () => {
    const base = new Y.Doc();
    para(frag(base), BODY);
    const mem = memoryStore(state(base));
    const a = load(state(base));
    const b = load(state(base));
    para(frag(b), "B typed this; A never got the broadcast");
    await persistCollabState(mem.store, "n", state(b));
    firstText(a).insert(0, "A ");
    const res = await persistCollabState(mem.store, "n", state(a));
    Y.applyUpdate(a, Uint8Array.from(Buffer.from(res.state!, "base64")));
    expect(collabDocText(a)).toContain("A never got the broadcast");
    expect(collabDocText(a)).toBe(textOf(mem.current()!));
  });

  it("the first save of a doc-less note inserts; a racing first save merges in", async () => {
    const mem = memoryStore(null);
    const a = new Y.Doc();
    para(frag(a), "from A");
    const b = new Y.Doc();
    para(frag(b), "from B");
    let interleaved = false;
    mem.hooks.beforeWrite = async () => {
      if (interleaved) return;
      interleaved = true;
      await persistCollabState(mem.store, "n", state(b));
    };
    expect(await persistCollabState(mem.store, "n", state(a))).toMatchObject({ ok: true });
    const final = textOf(mem.current()!);
    expect(final).toContain("from A");
    expect(final).toContain("from B");
  });

  it("gives up (ok: false) only after repeated races", async () => {
    const stored = new Y.Doc();
    para(frag(stored), BODY);
    const store: CollabStore = {
      read: async () => ({ state: state(stored), updatedAt: "t" }),
      insert: async () => false,
      update: async () => false,
    };
    const c = load(state(stored));
    para(frag(c), "more");
    expect(await persistCollabState(store, "n", state(c), undefined, 3)).toEqual({ ok: false });
  });
});

describe("collab doc save: safety snapshot before a save that removes most of the text", () => {
  const long = "x".repeat(600);

  it("snapshots once when the doc loses >50% and >200 chars", async () => {
    const stored = new Y.Doc();
    para(frag(stored), long);
    const c = load(state(stored));
    frag(c).delete(0, 1);
    para(frag(c), "tiny");
    const mem = memoryStore(state(stored));
    const snap = vi.fn(async () => {});
    expect(await persistCollabState(mem.store, "n", state(c), snap)).toMatchObject({ ok: true });
    expect(snap).toHaveBeenCalledTimes(1);
    expect(textOf(mem.current()!)).toBe("tiny"); // the save itself still lands
  });

  it("does not snapshot ordinary edits or small deletions", async () => {
    const stored = new Y.Doc();
    para(frag(stored), long);
    const c = load(state(stored));
    firstText(c).delete(0, 150); // 150 removed: under the 200 floor
    const mem = memoryStore(state(stored));
    const snap = vi.fn(async () => {});
    await persistCollabState(mem.store, "n", state(c), snap);
    expect(snap).not.toHaveBeenCalled();
  });

  it("a failing snapshot never blocks the save", async () => {
    const stored = new Y.Doc();
    para(frag(stored), long);
    const c = load(state(stored));
    frag(c).delete(0, 1);
    const mem = memoryStore(state(stored));
    expect(await persistCollabState(mem.store, "n", state(c), async () => { throw new Error("db down"); })).toMatchObject({ ok: true });
  });
});
