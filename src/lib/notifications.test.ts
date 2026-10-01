import { describe, it, expect } from "vitest";
import { prefEnabled, renderNotification, NOTIFICATION_TYPES } from "@/lib/notifications";

describe("prefEnabled", () => {
  it("uses the registry default when no pref is set", () => {
    expect(prefEnabled(null, "shared_with_me")).toBe(true);
    expect(prefEnabled(null, "edited_shared_note")).toBe(false);
    expect(prefEnabled({}, "chat_message")).toBe(true);
  });
  it("lets a stored pref override the default", () => {
    expect(prefEnabled({ shared_with_me: false }, "shared_with_me")).toBe(false);
    expect(prefEnabled({ edited_shared_note: true }, "edited_shared_note")).toBe(true);
  });
  it("rejects an unknown type", () => {
    // @ts-expect-error unknown type
    expect(prefEnabled(null, "nope")).toBe(false);
  });
});

describe("renderNotification", () => {
  const base = { id: "n1", actor_id: "u1", note_id: "note1", read_at: null, created_at: "2026-10-01T00:00:00Z" };

  it("builds a shared-with-me message with a shortcode link", () => {
    const v = renderNotification({ ...base, type: "shared_with_me", data: { actorName: "Ada", noteTitle: "Plans", shortcode: "abc" } });
    expect(v.title).toBe("Note shared with you");
    expect(v.body).toContain("Ada");
    expect(v.body).toContain("Plans");
    expect(v.href).toBe("/n/abc");
    expect(v.isRead).toBe(false);
  });

  it("falls back to generic names + no link, and reflects read state", () => {
    const v = renderNotification({ ...base, type: "chat_message", data: null, read_at: "2026-10-01T01:00:00Z" });
    expect(v.body).toContain("Someone");
    expect(v.body).toContain("a note");
    expect(v.href).toBeNull();
    expect(v.isRead).toBe(true);
  });

  it("every registered type renders a non-empty body", () => {
    for (const type of Object.keys(NOTIFICATION_TYPES)) {
      const v = renderNotification({ ...base, type, data: { actorName: "A", noteTitle: "T" } });
      expect(v.body.length).toBeGreaterThan(0);
    }
  });
});
