import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchCollabState } from "./collab-client";

// "No doc yet" (ok, state null) must never be confused with "couldn't load":
// the editor seeds only on the first.
const reply = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

afterEach(() => vi.unstubAllGlobals());

describe("fetchCollabState", () => {
  it("a stored doc", async () => {
    reply(200, { ok: true, state: "AAA=" });
    expect(await fetchCollabState({ noteId: "n" })).toEqual({ ok: true, state: "AAA=" });
  });
  it("no doc yet", async () => {
    reply(200, { ok: true, state: null });
    expect(await fetchCollabState({ noteId: "n" })).toEqual({ ok: true, state: null });
  });
  it("server error, forbidden, a pre-upgrade body, or a network failure: not ok", async () => {
    reply(500, { ok: false });
    expect(await fetchCollabState({ noteId: "n" })).toEqual({ ok: false });
    reply(403, { ok: false });
    expect(await fetchCollabState({ shortcode: "s" })).toEqual({ ok: false });
    reply(200, { state: null }); // an older server: can't tell "none" from "failed"
    expect(await fetchCollabState({ noteId: "n" })).toEqual({ ok: false });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await fetchCollabState({ noteId: "n" })).toEqual({ ok: false });
  });
});
