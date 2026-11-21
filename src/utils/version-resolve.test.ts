import { describe, it, expect } from "vitest";
import { resolveWrite, baseAfterIncoming } from "./version-resolve";
import { sameNoteContent } from "./notes-utils";

describe("resolveWrite — optimistic concurrency decision", () => {
  it("CAS: base matches server version → apply and bump", () => {
    expect(resolveWrite({ mode: "cas", baseVersion: 4, serverVersion: 4 })).toEqual({
      kind: "apply",
      nextVersion: 5,
      snapshotPrior: false,
    });
  });

  it("CAS: stale base (server moved on) → conflict", () => {
    expect(resolveWrite({ mode: "cas", baseVersion: 3, serverVersion: 5 })).toEqual({
      kind: "conflict",
      serverVersion: 5,
    });
  });

  it("CAS: no base version → conflict (never blindly overwrite)", () => {
    expect(resolveWrite({ mode: "cas", baseVersion: undefined, serverVersion: 2 })).toEqual({
      kind: "conflict",
      serverVersion: 2,
    });
  });

  it("projection: always applies, no history snapshot", () => {
    expect(resolveWrite({ mode: "projection", baseVersion: undefined, serverVersion: 7 })).toEqual({
      kind: "apply",
      nextVersion: 8,
      snapshotPrior: false,
    });
  });

  it("legacy (old client / pre-upgrade queue op): applies but snapshots prior content", () => {
    expect(resolveWrite({ mode: "legacy", baseVersion: undefined, serverVersion: 1 })).toEqual({
      kind: "apply",
      nextVersion: 2,
      snapshotPrior: true,
    });
  });
});


describe("baseAfterIncoming (editor base after a store update)", () => {
  const run = (base: number, baseContent: string, incomingVersion: number, incomingContent: string) =>
    baseAfterIncoming({ base, baseContent, incomingVersion, incomingContent, same: sameNoteContent });

  it("adopts a higher version holding our own text (stale cache paint)", () => {
    expect(run(2, "alpha bravo charlie\n", 3, "alpha bravo charlie")).toBe(3);
  });
  it("ignores trailing blank lines and whitespace when comparing", () => {
    expect(run(2, "a\n\n", 3, "a  \n\n\n")).toBe(3);
    expect(run(2, "a\r\nb\n", 3, "a\nb")).toBe(3);
  });
  it("keeps the base when the higher version has different text (a real edit elsewhere)", () => {
    expect(run(2, "alpha", 3, "alpha and more")).toBe(2);
  });
  it("never moves backwards or sideways", () => {
    expect(run(5, "x", 4, "x")).toBe(5);
    expect(run(5, "x", 5, "x")).toBe(5);
  });
  it("leaves the base alone without an incoming version", () => {
    expect(baseAfterIncoming({ base: 2, baseContent: "x", incomingVersion: undefined, incomingContent: "x", same: sameNoteContent })).toBe(2);
  });
});
