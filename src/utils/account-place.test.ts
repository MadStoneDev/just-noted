// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  readPlace,
  writePlace,
  ownNoteToRestore,
  sharedToRestore,
  isSwitchBoot,
  __resetAccountPlaceCaches,
} from "./account-place";
import { SWITCH_MARKER_KEY } from "./accounts";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  __resetAccountPlaceCaches();
});

describe("per-account place", () => {
  it("remembers panel, note and shared note per account", () => {
    writePlace("a", { panel: "tags", noteId: "n1" });
    writePlace("b", { panel: "shared", shared: "sc1" });
    expect(readPlace("a")).toEqual({ panel: "tags", noteId: "n1" });
    expect(readPlace("b")).toEqual({ panel: "shared", shared: "sc1" });
  });

  it("never carries one account's place to another", () => {
    writePlace("a", { panel: "notebooks", noteId: "n1", shared: "sc1" });
    expect(readPlace("b")).toEqual({});
    expect(readPlace("guest")).toEqual({});
  });

  it("merges patches and clears fields with null", () => {
    writePlace("a", { panel: "tags", noteId: "n1", shared: "sc1" });
    writePlace("a", { shared: null });
    expect(readPlace("a")).toEqual({ panel: "tags", noteId: "n1" });
  });

  it("ignores junk", () => {
    localStorage.setItem("jn_account_place", JSON.stringify({ a: { panel: "bogus", noteId: 5 } }));
    expect(readPlace("a")).toEqual({});
    localStorage.setItem("jn_account_place", "not json");
    expect(readPlace("a")).toEqual({});
  });
});

describe("own note to restore", () => {
  const live = ["n1", "n2"];

  it("reopens the remembered note when it still exists", () => {
    expect(ownNoteToRestore({ noteId: "n2" }, live, true)).toBe("n2");
    expect(ownNoteToRestore({ noteId: "n2" }, live, false)).toBe("n2");
  });

  it("after a switch: a deleted remembered note means no note open", () => {
    expect(ownNoteToRestore({ noteId: "gone" }, live, true)).toBeNull();
  });

  it("after a switch: nothing remembered means no note open", () => {
    expect(ownNoteToRestore({}, live, true)).toBeNull();
  });

  it("after a switch: a remembered shared note wins (no own note under it)", () => {
    expect(ownNoteToRestore({ noteId: "n1", shared: "sc" }, live, true)).toBeNull();
  });

  it("on a normal load: falls back to the most recent note", () => {
    expect(ownNoteToRestore({ noteId: "gone" }, live, false)).toBe("n1");
    expect(ownNoteToRestore({}, live, false)).toBe("n1");
    expect(ownNoteToRestore({}, [], false)).toBeNull();
  });
});

describe("shared note to restore", () => {
  it("restores the account's shared note on /", () => {
    expect(sharedToRestore({ shared: "abc" }, "/")).toBe("abc");
  });

  it("never replaces the note in a /n/ link (or any other routed view)", () => {
    expect(sharedToRestore({ shared: "abc" }, "/n/xyz")).toBeNull();
    expect(sharedToRestore({ shared: "abc" }, "/settings")).toBeNull();
  });

  it("nothing remembered", () => {
    expect(sharedToRestore({}, "/")).toBeNull();
  });
});

describe("switch boot", () => {
  it("is true when the switch marker is present, and stays cached after it's cleared", () => {
    sessionStorage.setItem(SWITCH_MARKER_KEY, "{}");
    expect(isSwitchBoot()).toBe(true);
    sessionStorage.removeItem(SWITCH_MARKER_KEY);
    expect(isSwitchBoot()).toBe(true);
  });

  it("is false on a normal load", () => {
    expect(isSwitchBoot()).toBe(false);
  });
});
