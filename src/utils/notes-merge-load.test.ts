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

  it("uses the store's copy of a note edited during the load (typed text kept)", () => {
    const cached = mk({ id: "a", content: "before" });
    const typed = { ...cached, content: "before + typed during load" };
    const r = keepChangesMadeDuringLoad([mk({ id: "a", content: "server", version: 2 })], [cached], [typed], LOAD_START);
    expect(r).toEqual([typed]);
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

  it("with nothing done during the load, the reconciled list is committed unchanged", () => {
    const cached = [mk({ id: "a" }), mk({ id: "b" })];
    const reconciled = [mk({ id: "b", content: "srv" }), mk({ id: "a", content: "srv" })];
    expect(keepChangesMadeDuringLoad(reconciled, cached, cached, LOAD_START)).toEqual(reconciled);
  });
});
