import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldSyncOp,
  needsCloudUserTag,
  setActiveSupabaseUser,
  getActiveSupabaseUser,
} from "./offline-queue-guard";

describe("shouldSyncOp — B7 cross-account write guard", () => {
  const cloud = (userId: string) => ({ source: "supabase" as const, userId });
  const local = (userId: string) => ({ source: "redis" as const, userId });

  it("sends a cloud op only for the active account", () => {
    expect(shouldSyncOp(cloud("userA"), "userA")).toBe(true);
  });

  it("NEVER sends a cloud op belonging to a different account", () => {
    // The core B7 guarantee: account A's queued op must not flush while B is signed in.
    expect(shouldSyncOp(cloud("userA"), "userB")).toBe(false);
  });

  it("does not send a cloud op when no account is active (signed out / booting)", () => {
    expect(shouldSyncOp(cloud("userA"), null)).toBe(false);
    expect(shouldSyncOp(cloud("userA"), "")).toBe(false);
  });

  it("always sends Redis (device-scoped) ops regardless of the active account", () => {
    // Local notes belong to the device, not an account, so they are never blocked —
    // even when signed out or when a different account is active.
    expect(shouldSyncOp(local("guest-device-id"), null)).toBe(true);
    expect(shouldSyncOp(local("guest-device-id"), "userA")).toBe(true);
    expect(shouldSyncOp(local("guest-device-id"), "userB")).toBe(true);
  });
});

describe("needsCloudUserTag — legacy untagged-op detection", () => {
  it("flags a cloud op with no userId", () => {
    expect(needsCloudUserTag({ source: "supabase", userId: "" })).toBe(true);
  });

  it("does not flag a cloud op that already carries a userId", () => {
    expect(needsCloudUserTag({ source: "supabase", userId: "userA" })).toBe(false);
  });

  it("never flags a Redis op (device-scoped, no tag needed)", () => {
    expect(needsCloudUserTag({ source: "redis", userId: "" })).toBe(false);
    expect(needsCloudUserTag({ source: "redis", userId: "guest-id" })).toBe(false);
  });
});

describe("active-user holder", () => {
  beforeEach(() => setActiveSupabaseUser(null));

  it("round-trips the set value", () => {
    setActiveSupabaseUser("userA");
    expect(getActiveSupabaseUser()).toBe("userA");
  });

  it("normalises empty string to null (treated as signed-out)", () => {
    setActiveSupabaseUser("");
    expect(getActiveSupabaseUser()).toBeNull();
  });

  it("clears back to null on sign-out", () => {
    setActiveSupabaseUser("userA");
    setActiveSupabaseUser(null);
    expect(getActiveSupabaseUser()).toBeNull();
  });

  it("models the switch sequence: A's op is blocked once the session is B", () => {
    // Signed in as A → A's queued op is sendable.
    setActiveSupabaseUser("userA");
    const opFromA = { source: "supabase" as const, userId: "userA" };
    expect(shouldSyncOp(opFromA, getActiveSupabaseUser())).toBe(true);

    // After switching to B (what use-notes-sync does on the fresh load), A's
    // still-queued op is refused under B's session.
    setActiveSupabaseUser("userB");
    expect(shouldSyncOp(opFromA, getActiveSupabaseUser())).toBe(false);
  });
});
