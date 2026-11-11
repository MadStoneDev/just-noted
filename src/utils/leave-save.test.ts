import { describe, it, expect } from "vitest";
import { buildLeaveSaveBody, LEAVE_SAVE_MAX_BYTES } from "./leave-save";

const base = {
  noteId: "n1",
  goal: 0,
  goalType: "" as const,
  baseVersion: 3,
  copyId: "00000000-0000-4000-8000-000000000001",
  copyStamp: "11 Nov, 10:00 am",
};

describe("buildLeaveSaveBody — keepalive size cap", () => {
  it("serialises a normal note", () => {
    const body = buildLeaveSaveBody({ ...base, content: "hello" });
    expect(JSON.parse(body!)).toMatchObject({ noteId: "n1", content: "hello", baseVersion: 3 });
  });

  it("skips a payload over the cap (the offline queue covers it)", () => {
    expect(buildLeaveSaveBody({ ...base, content: "a".repeat(LEAVE_SAVE_MAX_BYTES) })).toBeNull();
  });

  it("measures UTF-8 bytes, not string length", () => {
    // 3 bytes per char: well under the cap in .length, over it in bytes.
    const content = "€".repeat(Math.ceil(LEAVE_SAVE_MAX_BYTES / 2));
    expect(content.length).toBeLessThan(LEAVE_SAVE_MAX_BYTES);
    expect(buildLeaveSaveBody({ ...base, content })).toBeNull();
  });
});
