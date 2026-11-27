// Guards the small-text floor and muted-text contrast set in globals.css.
//  1. No component may use an arbitrary text size below 12px. Use the
//     text-label (12px) / text-meta (13px) tokens instead.
//  2. The muted greys (ink-4, ink-5, text-tertiary) must meet WCAG AA (4.5:1)
//     on every surface small text sits on, in both themes.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname);
const CSS = fs.readFileSync(path.join(SRC, "app/globals.css"), "utf8");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    if (!/\.tsx$/.test(e.name) || /\.(test|spec)\.tsx$/.test(e.name)) return [];
    return [p];
  });
}

describe("small-text floor", () => {
  it("no component uses an arbitrary text size under 12px", () => {
    const offenders: string[] = [];
    for (const f of sourceFiles(SRC)) {
      fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (/(?<![\w-])(?:[a-z0-9-]+:)*text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/.test(line)) {
          offenders.push(`${path.relative(SRC, f)}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("defines the label and meta size tokens at 12px / 13px", () => {
    expect(CSS).toMatch(/--text-label:\s*12px;/);
    expect(CSS).toMatch(/--text-meta:\s*13px;/);
  });
});

// ---- contrast --------------------------------------------------------------

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Pull a token's value out of a CSS block (first match after `anchor`).
function token(block: string, name: string): string {
  const m = block.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`token --color-${name} not found`);
  return m[1];
}
// `.dark {` blocks hold the explicit dark theme; the first `:root {` blocks hold light.
function blocks(selector: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(selector.source + "\\s*\\{([^}]*)\\}", "g");
  while ((m = re.exec(CSS))) out.push(m[1]);
  return out;
}
const light = blocks(/(?<![\w-]):root/).join("\n");
const dark = blocks(/\.dark/).join("\n");

const AA = 4.5;

describe("muted text contrast (WCAG AA)", () => {
  const cases: [string, string, string[], string[]][] = [
    // theme, block, muted text tokens, surfaces small text sits on
    ["dark", dark, ["ink-4", "ink-5"], ["canvas", "panel", "panel-alt", "raised", "raised-soft"]],
    ["dark", dark, ["text-tertiary"], ["bg-primary", "bg-secondary", "bg-editor", "bg-tertiary", "bg-elevated"]],
    ["light", light, ["ink-4", "ink-5"], ["canvas", "panel", "panel-alt", "raised", "raised-soft"]],
    ["light", light, ["text-tertiary"], ["bg-primary", "bg-secondary", "bg-tertiary"]],
  ];
  for (const [theme, block, fgs, bgs] of cases) {
    for (const fg of fgs) {
      it(`${theme} ${fg} ≥ ${AA}:1 on ${bgs.join(", ")}`, () => {
        for (const bg of bgs) {
          const ratio = contrast(token(block, fg), token(block, bg));
          expect(ratio, `${fg} on ${bg}`).toBeGreaterThanOrEqual(AA);
        }
      });
    }
  }

  // Search-hit highlights (redesign): body text on the soft mark, and the
  // strong (title) mark with its own text colour.
  for (const [theme, block] of [["light", light], ["dark", dark]] as const) {
    it(`${theme} search-hit marks ≥ ${AA}:1`, () => {
      expect(contrast(token(block, "ink"), token(block, "mark")), "ink on mark").toBeGreaterThanOrEqual(AA);
      expect(
        contrast(token(block, "mark-strong-text"), token(block, "mark-strong")),
        "mark-strong-text on mark-strong",
      ).toBeGreaterThanOrEqual(AA);
    });
  }

  it("dark muted text still reads as secondary to primary text", () => {
    const canvas = token(dark, "canvas");
    const ink = contrast(token(dark, "ink"), canvas);
    const ink3 = contrast(token(dark, "ink-3"), canvas);
    const ink4 = contrast(token(dark, "ink-4"), canvas);
    const ink5 = contrast(token(dark, "ink-5"), canvas);
    expect(ink).toBeGreaterThan(ink3);
    expect(ink3).toBeGreaterThan(ink4);
    expect(ink4).toBeGreaterThan(ink5);
  });
});
