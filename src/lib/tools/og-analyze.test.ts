import { describe, it, expect } from "vitest";
import { analyze, type ImageResult } from "./og-analyze";
import type { ParsedTags } from "./og-parse";

const base = (og: Record<string, string>, twitter: Record<string, string> = {}): ParsedTags => ({
  og, twitter, raw: [],
});

const okImage: ImageResult = { status: "ok", width: 1200, height: 630, format: "png", contentType: "image/png", bytes: 120_000 };

function find(items: ReturnType<typeof analyze>["items"], tag: string) {
  return items.find((i) => i.tag === tag)!;
}

describe("analyze (spec §8.3 checks)", () => {
  it("passes a complete, well-formed set", () => {
    const tags = base(
      {
        "og:title": "A good title",
        "og:description": "A fine description that is not too long.",
        "og:image": "https://x/card.png",
        "og:url": "https://example.com/page",
        "og:type": "website",
        "og:site_name": "Example",
      },
      { "twitter:card": "summary_large_image", "twitter:title": "t", "twitter:description": "d", "twitter:image": "i" },
    );
    const { items, summary } = analyze(tags, "https://example.com/page", okImage);
    expect(find(items, "og:title").marker).toBe("pass");
    expect(find(items, "og:image").marker).toBe("pass");
    expect(find(items, "og:url").marker).toBe("pass");
    expect(summary.fail).toBe(0);
    expect(summary.warn).toBe(0);
    expect(summary.pass).toBeGreaterThanOrEqual(8);
  });

  it("fails on missing og:title and og:image", () => {
    const { items } = analyze(base({}), "https://example.com", null);
    expect(find(items, "og:title").marker).toBe("fail");
    expect(find(items, "og:image").marker).toBe("fail");
    // order: fails come before warnings/passes/info
    expect(items[0].marker).toBe("fail");
  });

  it("warns on a long title and long description", () => {
    const tags = base({
      "og:title": "x".repeat(70),
      "og:description": "y".repeat(200),
      "og:image": "https://x/i.png",
    });
    const { items } = analyze(tags, "https://example.com", okImage);
    expect(find(items, "og:title").marker).toBe("warn");
    expect(find(items, "og:description").marker).toBe("warn");
  });

  it("warns on a small image and on a wrong aspect ratio", () => {
    const small = analyze(base({ "og:title": "t", "og:image": "i" }), "u", { status: "ok", width: 600, height: 315, format: "png", contentType: "image/png", bytes: 1000 });
    expect(find(small.items, "og:image").marker).toBe("warn");
    const square = analyze(base({ "og:title": "t", "og:image": "i" }), "u", { status: "ok", width: 1200, height: 1200, format: "png", contentType: "image/png", bytes: 1000 });
    expect(find(square.items, "og:image").verdict).toMatch(/cropped/);
  });

  it("fails og:image when the URL isn't an image", () => {
    const { items } = analyze(base({ "og:title": "t", "og:image": "i" }), "u", { status: "error", reason: "not-image" });
    expect(find(items, "og:image").marker).toBe("fail");
  });

  it("warns when og:url differs from the tested URL", () => {
    const { items } = analyze(base({ "og:title": "t", "og:url": "https://other.com/x" }), "https://example.com/page", null);
    expect(find(items, "og:url").marker).toBe("warn");
    expect(find(items, "og:url").verdict).toMatch(/other\.com/);
  });

  it("marks missing twitter:title/description/image as info, not warnings", () => {
    const { items } = analyze(base({ "og:title": "t" }), "u", null);
    for (const t of ["twitter:title", "twitter:description", "twitter:image"]) {
      expect(find(items, t).marker).toBe("info");
    }
  });
});
