import { describe, it, expect } from "vitest";
import { keepChangesMadeDuringLoad } from "./notes-merge";

const mk = (o: Record<string, unknown>): any => ({
  id: "x",
  title: "Note",
  content: "",
  contentFormat: "markdown",
  source: "supabase",
  createdAt: 1,
  updatedAt: 1,
  version: 1,
  goal: 0,
  goal_type: "",
  isPinned: false,
  isPrivate: false,
  deletedAt: undefined,
  ...o,
});

const LOAD_START = 1000;

describe("keepChangesMadeDuringLoad — the startup commit keeps what the user did meanwhile", () => {
  it("keeps a note created during the load that the (stale) server list doesn't have", () => {
    const cached = mk({ id: "a", content: "cached" });
    const baseline = [cached];
    const reconciled = [mk({ id: "a", content: "server" })];
    const created = mk({ id: "new", title: "New Note #1", createdAt: LOAD_START + 5 });
    const current = [created, cached];

    const r = keepChangesMadeDuringLoad(reconciled, baseline, current, LOAD_START);
    expect(r.map((n) => n.id)).toEqual(["new", "a"]); // new note first, like addNote
    expect(r[0]).toBe(created);
    expect(r[1].content).toBe("server"); // untouched note: reconcile's copy
  });

  it("keeps a new note when there was no cache at all (empty baseline)", () => {
    const created = mk({ id: "new", createdAt: LOAD_START + 1 });
    const r = keepChangesMadeDuringLoad([mk({ id: "s" })], [], [created], LOAD_START);
    expect(r.map((n) => n.id)).toEqual(["new", "s"]);
  });

  it("uses the store's copy of a note changed during the load (same server version)", () => {
    const cached = mk({ id: "a", content: "before", version: 2 });
    const typed = { ...cached, content: "before + typed during load" };
    const r = keepChangesMadeDuringLoad([mk({ id: "a", content: "server", version: 2 })], [cached], [typed], LOAD_START);
    expect(r).toEqual([typed]);
  });

  it("keeps the store copy when it is AHEAD of the fetched copy (a save landed during the load)", () => {
    const cached = mk({ id: "a", content: "v3", version: 3 });
    const saved = { ...cached, content: "v4 saved during load", version: 4 };
    const r = keepChangesMadeDuringLoad([mk({ id: "a", content: "v3", version: 3 })], [cached], [saved], LOAD_START);
    expect(r).toEqual([saved]);
  });

  it("prefers the store copy of a just-created note the server list already has", () => {
    const created = mk({ id: "new", content: "typed", createdAt: LOAD_START + 5 });
    const r = keepChangesMadeDuringLoad([mk({ id: "new", content: "" })], [], [created], LOAD_START);
    expect(r).toEqual([created]);
  });

  it("keeps a note trashed during the load trashed (store tombstone wins)", () => {
    const cached = mk({ id: "a", content: "x" });
    const trashed = { ...cached, deletedAt: LOAD_START + 3 };
    const r = keepChangesMadeDuringLoad([mk({ id: "a", content: "x" })], [cached], [trashed], LOAD_START);
    expect(r[0].deletedAt).toBe(LOAD_START + 3);
  });

  it("a note removed from the store during the load stays removed", () => {
    const cached = mk({ id: "a" });
    const r = keepChangesMadeDuringLoad([mk({ id: "a" }), mk({ id: "b" })], [cached], [], LOAD_START);
    expect(r.map((n) => n.id)).toEqual(["b"]);
  });

  it("an untouched cached note reconcile dropped stays dropped (no resurrection)", () => {
    const stale = mk({ id: "gone", createdAt: 10 }); // old, deleted elsewhere
    const r = keepChangesMadeDuringLoad([mk({ id: "s" })], [stale], [stale], LOAD_START);
    expect(r.map((n) => n.id)).toEqual(["s"]);
  });

  it("keeps a note created just before the cache paint (in the baseline, created after load start)", () => {
    // Ctrl+J landed before STEP 0; the note is in the baseline unchanged but
    // was created during this load — the stale server list must not drop it.
    const early = mk({ id: "early", createdAt: LOAD_START + 1 });
    const r = keepChangesMadeDuringLoad([mk({ id: "s" })], [early], [early], LOAD_START);
    expect(r.map((n) => n.id)).toEqual(["early", "s"]);
  });

  it("keeps reconcile's own additions (conflicted copies, server-only notes)", () => {
    const cached = mk({ id: "a" });
    const copy = mk({ id: "copy", title: "A (conflicted copy — 11 Nov)", createdAt: LOAD_START + 2 });
    const remote = mk({ id: "remote" });
    const r = keepChangesMadeDuringLoad([mk({ id: "a" }), remote, copy], [cached], [cached], LOAD_START);
    expect(r.map((n) => n.id)).toEqual(["a", "remote", "copy"]);
  });

  // ---- version rule: identity is only a hint, a newer server copy always wins ----

  it("a changed store copy yields to a server copy with a higher version", () => {
    const cached = mk({ id: "a", content: "old", version: 2 });
    const pinned = { ...cached, isPinned: true }; // touched locally during the load
    const remote = mk({ id: "a", content: "edited on another device", version: 3 });
    const r = keepChangesMadeDuringLoad([remote], [cached], [pinned], LOAD_START);
    expect(r).toEqual([remote]);
  });

  it("a bulk rebuild (drag-reorder replaces every object) can't make stale copies win", () => {
    const a = mk({ id: "a", content: "a-old", version: 1, order: 1 });
    const b = mk({ id: "b", content: "b-old", version: 5, order: 2 });
    const baseline = [a, b];
    // Every object replaced, nothing else changed (sidebar drag: { ...n, order: i }).
    const rebuilt = [{ ...b, order: 0 }, { ...a, order: 1 }];
    const server = [
      mk({ id: "a", content: "a-new from elsewhere", version: 2, order: 1 }),
      mk({ id: "b", content: "b-old", version: 5, order: 2 }),
    ];
    const r = keepChangesMadeDuringLoad(server, baseline, rebuilt, LOAD_START);
    const byId = Object.fromEntries(r.map((n) => [n.id, n]));
    expect(byId.a.content).toBe("a-new from elsewhere"); // newer server version wins
    expect(byId.b).toBe(rebuilt[0]); // same version: the local reorder is kept
  });

  it("a bulk rebuild can't resurrect a note deleted elsewhere during the load", () => {
    const a = mk({ id: "a", createdAt: 10 });
    const gone = mk({ id: "gone", createdAt: 10 });
    const rebuilt = [{ ...a, order: 0 }, { ...gone, order: 1 }]; // every object replaced
    const r = keepChangesMadeDuringLoad([mk({ id: "a" })], [a, gone], rebuilt, LOAD_START);
    expect(r.map((n) => n.id)).toEqual(["a"]);
  });

  it("a store-only note that appeared during the load is kept whatever its createdAt", () => {
    const inserted = mk({ id: "rt", createdAt: 5 }); // realtime insert / other tab, old createdAt
    const r = keepChangesMadeDuringLoad([mk({ id: "s" })], [], [inserted], LOAD_START);
    expect(r.map((n) => n.id)).toEqual(["rt", "s"]);
  });

  it("missing version counts as 1 on either side", () => {
    const cached = mk({ id: "a", version: undefined });
    const touched = { ...cached, title: "renamed" };
    expect(keepChangesMadeDuringLoad([mk({ id: "a", version: undefined })], [cached], [touched], LOAD_START)).toEqual([touched]);
    expect(keepChangesMadeDuringLoad([mk({ id: "a", version: 2 })], [cached], [touched], LOAD_START)[0].version).toBe(2);
  });

  it("with nothing done during the load, the reconciled list is committed unchanged", () => {
    const cached = [mk({ id: "a" }), mk({ id: "b" })];
    const reconciled = [mk({ id: "b", content: "srv" }), mk({ id: "a", content: "srv" })];
    expect(keepChangesMadeDuringLoad(reconciled, cached, cached, LOAD_START)).toEqual(reconciled);
  });
});
