import { describe, it, expect } from "vitest";
import { validateChatMedia, baseMime } from "@/lib/chat-media";

const MB = 1024 * 1024;

describe("baseMime", () => {
  it("strips codecs and lowercases", () => {
    expect(baseMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseMime("IMAGE/JPEG")).toBe("image/jpeg");
  });
});

describe("validateChatMedia", () => {
  it("accepts allowed images and returns the extension", () => {
    expect(validateChatMedia("image", "image/jpeg", 100)).toEqual({ ok: true, ext: "jpg" });
    expect(validateChatMedia("image", "image/png", 100)).toEqual({ ok: true, ext: "png" });
    expect(validateChatMedia("image", "image/webp", 100)).toEqual({ ok: true, ext: "webp" });
  });

  it("routes gif through the gif kind, not image", () => {
    expect(validateChatMedia("gif", "image/gif", 100)).toEqual({ ok: true, ext: "gif" });
    // a gif declared as an image is rejected (wrong kind allowlist)
    expect(validateChatMedia("image", "image/gif", 100).ok).toBe(false);
  });

  it("accepts audio with a codecs suffix", () => {
    expect(validateChatMedia("audio", "audio/webm;codecs=opus", 100)).toEqual({ ok: true, ext: "webm" });
  });

  it("rejects unknown kinds and mimes", () => {
    expect(validateChatMedia("video", "video/mp4", 100).ok).toBe(false);
    expect(validateChatMedia("image", "image/tiff", 100).ok).toBe(false);
  });

  it("enforces per-kind size caps and non-empty", () => {
    expect(validateChatMedia("image", "image/png", 8 * MB).ok).toBe(true);
    expect(validateChatMedia("image", "image/png", 8 * MB + 1).ok).toBe(false);
    expect(validateChatMedia("audio", "audio/webm", 16 * MB).ok).toBe(true);
    expect(validateChatMedia("audio", "audio/webm", 16 * MB + 1).ok).toBe(false);
    expect(validateChatMedia("image", "image/png", 0).ok).toBe(false);
  });
});
