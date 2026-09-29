import { describe, it, expect } from "vitest";
import { resolveWrite } from "./version-resolve";

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
