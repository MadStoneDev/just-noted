import { describe, it, expect } from "vitest";
import { decideTakeover } from "./takeover";

const base = { editorText: "", clean: true, onVersion: 3 };

describe("decideTakeover — text another tab left behind", () => {
  it("nothing left behind → nothing", () => {
    expect(decideTakeover(base)).toEqual({ kind: "none" });
  });

  it("same text as the editor → nothing", () => {
    expect(decideTakeover({ ...base, editorText: "a", pending: { content: "a", baseVersion: 3 } })).toEqual({
      kind: "none",
    });
  });

  it("clean editor, pending text on our version → adopt", () => {
    expect(decideTakeover({ ...base, pending: { content: "typed before close", baseVersion: 3 } })).toEqual({
      kind: "adopt",
      content: "typed before close",
      base: 3,
      from: "pending",
    });
  });

  it("clean editor, pending text on another version → replay (server decides)", () => {
    expect(decideTakeover({ ...base, pending: { content: "x", baseVersion: 2 } })).toEqual({
      kind: "replay",
      from: "pending",
    });
    // No base at all (an older build's entry): the server decides too.
    expect(decideTakeover({ ...base, pending: { content: "x" } })).toEqual({ kind: "replay", from: "pending" });
  });

  it("dirty editor (the user typed first) → copy, never adopt over the user's words", () => {
    expect(
      decideTakeover({ ...base, clean: false, editorText: "tab 2 words", pending: { content: "tab 1", baseVersion: 3 } }),
    ).toEqual({ kind: "copy", from: "pending" });
    expect(
      decideTakeover({
        ...base,
        clean: false,
        editorText: "tab 2 words",
        cached: { content: "tab 1", version: 3, localEdit: 123 },
      }),
    ).toEqual({ kind: "copy", from: "cached" });
  });

  it("only an unconfirmed cached copy counts", () => {
    expect(decideTakeover({ ...base, cached: { content: "server text", version: 3 } })).toEqual({ kind: "none" });
    expect(decideTakeover({ ...base, cached: { content: "tab 1", version: 3, localEdit: 1 } })).toEqual({
      kind: "adopt",
      content: "tab 1",
      base: 3,
      from: "cached",
    });
  });

  it("an emptied cached copy never blanks text", () => {
    expect(
      decideTakeover({ ...base, editorText: "keep me", cached: { content: "  ", version: 3, localEdit: 1 } }),
    ).toEqual({ kind: "none" });
  });

  it("pending text wins over the cache", () => {
    expect(
      decideTakeover({
        ...base,
        pending: { content: "newest", baseVersion: 3 },
        cached: { content: "older", version: 3, localEdit: 1 },
      }),
    ).toMatchObject({ kind: "adopt", content: "newest" });
  });
});
