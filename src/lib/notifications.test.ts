import { describe, it, expect } from "vitest";
import {
  inAppEnabled,
  prefForType,
  sanitizeNotificationPrefs,
  renderNotification,
  NOTIFICATION_TYPES,
} from "@/lib/notifications";

describe("inAppEnabled / defaults", () => {
  it("uses the registry defaults (shares instantly; edits/chat off; mentions instantly)", () => {
    expect(inAppEnabled(null, "shared_with_me")).toBe(true);
    expect(inAppEnabled(null, "edited_shared_note")).toBe(false);
    expect(inAppEnabled({}, "chat_message")).toBe(false);
    expect(inAppEnabled(null, "mention")).toBe(true);
  });
  it("lets a stored frequency override the default", () => {
    expect(inAppEnabled({ shared_with_me: { inApp: "off" } }, "shared_with_me")).toBe(false);
    expect(inAppEnabled({ chat_message: { inApp: "instantly" } }, "chat_message")).toBe(true);
  });
  it("rejects an unknown type", () => {
    // @ts-expect-error unknown type
    expect(inAppEnabled(null, "nope")).toBe(false);
  });
});

describe("prefForType", () => {
  it("merges stored over default and normalises bad values", () => {
    expect(prefForType({ shared_with_me: { email: "weekly" } }, "shared_with_me")).toEqual({ inApp: "instantly", email: "weekly" });
    expect(prefForType({ shared_with_me: { inApp: "garbage" as any } }, "shared_with_me")).toEqual({ inApp: "instantly", email: "off" });
  });
});

describe("sanitizeNotificationPrefs", () => {
  it("drops unknown types and invalid values", () => {
    const out = sanitizeNotificationPrefs({ shared_with_me: { inApp: "daily", email: "nope" }, bogus: { inApp: "off" } });
    expect(out.shared_with_me).toEqual({ inApp: "daily", email: "off" });
    expect((out as any).bogus).toBeUndefined();
  });
  it("returns an empty object for junk input", () => {
    expect(sanitizeNotificationPrefs("x")).toEqual({});
    expect(sanitizeNotificationPrefs(null)).toEqual({});
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
