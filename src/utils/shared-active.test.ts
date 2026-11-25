import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { isSharedItemActive, sharedTabFor } from "./shared-active";
import { noteShortcodeFromHref } from "@/components/notifications-view";

describe("Shared list active row", () => {
  const owned = { source: "owned" as const, shortcode: "mine1", noteId: "note-mine" };
  const granted = { source: "granted" as const, shortcode: "theirs1", noteId: "note-theirs" };

  it("a shared note opened from a notification highlights that note, not the last own note", () => {
    // activeNoteId is still the own note the user had open before.
    expect(isSharedItemActive(granted, "theirs1", "note-mine")).toBe(true);
    expect(isSharedItemActive(owned, "theirs1", "note-mine")).toBe(false);
  });

  it("with no shared note open, an owned row matches the open own note", () => {
    expect(isSharedItemActive(owned, null, "note-mine")).toBe(true);
    expect(isSharedItemActive(granted, null, "note-mine")).toBe(false);
  });

  it("an own note opened by its share link matches on the shortcode", () => {
    expect(isSharedItemActive(owned, "mine1", "something-else")).toBe(true);
  });

  it("maps sources to sub-tabs", () => {
    expect(sharedTabFor("granted")).toBe("withme");
    expect(sharedTabFor("owned")).toBe("byme");
    expect(sharedTabFor("saved")).toBe("saved");
  });
});

describe("noteShortcodeFromHref", () => {
  it("reads the shortcode of a note link", () => {
    expect(noteShortcodeFromHref("/n/abc123")).toBe("abc123");
    expect(noteShortcodeFromHref("/n/a%20b")).toBe("a b");
  });
  it("ignores anything else", () => {
    expect(noteShortcodeFromHref(null)).toBeNull();
    expect(noteShortcodeFromHref("/settings")).toBeNull();
    expect(noteShortcodeFromHref("/n/abc/def")).toBeNull();
  });
});
