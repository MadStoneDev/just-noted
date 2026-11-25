// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readLastShared, shortcodeToRestore, writeLastShared } from "./last-shared";

beforeEach(() => localStorage.clear());

describe("last shared note restore", () => {
  it("restores the account's own last shared note on /", () => {
    writeLastShared({ shortcode: "abc", account: "u1" });
    expect(shortcodeToRestore(readLastShared(), "u1", "/")).toBe("abc");
  });

  it("never replaces the note in a /n/ link (or any other routed view)", () => {
    writeLastShared({ shortcode: "abc", account: "u1" });
    expect(shortcodeToRestore(readLastShared(), "u1", "/n/xyz")).toBeNull();
    expect(shortcodeToRestore(readLastShared(), "u1", "/settings")).toBeNull();
  });

  it("never restores another account's shared note", () => {
    writeLastShared({ shortcode: "abc", account: "u1" });
    expect(shortcodeToRestore(readLastShared(), "u2", "/")).toBeNull();
    expect(shortcodeToRestore(readLastShared(), "guest", "/")).toBeNull();
  });

  it("ignores the old unscoped value", () => {
    localStorage.setItem("justnoted_last_shared", "abc");
    expect(readLastShared()).toBeNull();
  });

  it("clears", () => {
    writeLastShared({ shortcode: "abc", account: "u1" });
    writeLastShared(null);
    expect(readLastShared()).toBeNull();
  });
});
