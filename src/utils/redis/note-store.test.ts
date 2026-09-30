import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory Redis hash + a JS implementation of the CAS Lua, so casUpdateNote's
// full flow (read field -> decide conflict -> atomic compare-and-set) is
// exercised without a live server.
const h = vi.hoisted(() => ({ store: new Map<string, Map<string, string>>() }));

vi.mock("@/utils/redis", () => ({
  redisRaw: {
    type: async (key: string) => (h.store.has(key) ? "hash" : "none"),
    hget: async (key: string, field: string) => h.store.get(key)?.get(field) ?? null,
    hgetall: async (key: string) => {
      const m = h.store.get(key);
      return m ? Object.fromEntries(m) : null;
    },
    hset: async (key: string, obj: Record<string, string>) => {
      let m = h.store.get(key);
      if (!m) {
        m = new Map();
        h.store.set(key, m);
      }
      for (const [f, v] of Object.entries(obj)) m.set(f, v);
      return 1;
    },
    hdel: async (key: string, field: string) => (h.store.get(key)?.delete(field) ? 1 : 0),
    incr: async () => 1,
    // CAS_LUA: if HGET(field) === expected then [HSET copy] + HSET(field,new).
    eval: async (_script: string, keys: string[], argv: string[]) => {
      const key = keys[0];
      const [field, expected, newVal, copyField, copyVal] = argv;
      const m = h.store.get(key);
      const cur = m?.get(field) ?? null;
      if (cur !== expected) return 0;
      if (copyField !== "") m!.set(copyField, copyVal);
      m!.set(field, newVal);
      return 1;
    },
    get: async () => null,
    set: async () => {},
    del: async () => {},
  },
}));

import { casUpdateNote, readAllNotes } from "./note-store";

const KEY = "notes:u1";
function seed(field: string, note: Record<string, unknown>) {
  let m = h.store.get(KEY);
  if (!m) {
    m = new Map();
    h.store.set(KEY, m);
  }
  m.set(field, JSON.stringify(note));
}

beforeEach(() => h.store.clear());

describe("casUpdateNote — atomic per-note CAS", () => {
  it("applies and bumps the version when the base matches", async () => {
    seed("n1", { id: "n1", title: "A", content: "old", version: 3 });
    const r = await casUpdateNote("u1", "n1", { content: "new", goal: 0, goalType: "" }, 3);
    expect(r.success).toBe(true);
    expect(r.version).toBe(4);
    expect(r.conflicted).toBe(false);
    const notes = await readAllNotes("u1");
    expect(notes.find((n) => n.id === "n1")!.content).toBe("new");
    expect(notes.find((n) => n.id === "n1")!.version).toBe(4);
  });

  it("a stale write preserves the existing content as a conflicted copy, then applies", async () => {
    seed("n1", { id: "n1", title: "A", content: "server text", version: 5 });
    const r = await casUpdateNote("u1", "n1", { content: "my text", goal: 0, goalType: "" }, 2);
    expect(r.success).toBe(true);
    expect(r.conflicted).toBe(true);
    const notes = await readAllNotes("u1");
    // The note now holds the user's text...
    expect(notes.find((n) => n.id === "n1")!.content).toBe("my text");
    // ...and the server's prior text survives as a separate copy.
    const copy = notes.find((n) => n.title.includes("conflicted copy"));
    expect(copy?.content).toBe("server text");
  });

  it("returns not_found for a missing note", async () => {
    const r = await casUpdateNote("u1", "missing", { content: "x", goal: 0, goalType: "" }, 1);
    expect(r.success).toBe(false);
    expect(r.error).toBe("not_found");
  });

  it("edit-after-delete: a note removed in another browser returns not_found (client salvages the text)", async () => {
    seed("n1", { id: "n1", title: "A", content: "before", version: 2 });
    // Another browser deleted it (HDEL'd the field) before this one caught up.
    h.store.get(KEY)!.delete("n1");
    const r = await casUpdateNote("u1", "n1", { content: "my unsent edit", goal: 0, goalType: "" }, 2);
    expect(r.success).toBe(false);
    expect(r.error).toBe("not_found");
    // The caller (saveNoteContent) turns this into a new "(recovered)" note so
    // the user's text is never lost.
  });
});
