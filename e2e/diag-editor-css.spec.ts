import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/no-conflicts";

// DIAGNOSTIC (not part of the normal suite): before/after check for editor CSS
// changes such as `white-space` on .ProseMirror. Writes a note that has empty
// lines (`&nbsp;` markers), lists, a task list, a code block with blank lines,
// a quote, runs of spaces and a hard break, then saves for each theme:
//   - a screenshot of the editor,
//   - each block's tag, box (x, y, w, h) and text, as JSON.
// Run it on two builds and compare the folders.
//
//   E2E_DIAG=1 E2E_DIAG_OUT=/path/before npx playwright test e2e/diag-editor-css.spec.ts
//
// Runs as an anonymous (local, Redis-backed) user.

test.skip(!process.env.E2E_DIAG, "diagnostic; set E2E_DIAG=1");

const OUT = process.env.E2E_DIAG_OUT ?? "test-results/diag-editor-css";
const EDITOR = ".ProseMirror";
const editor = (page: Page) => page.locator(EDITOR).first();

const SAMPLE = [
  "# Heading",
  "",
  "First paragraph with  two spaces and   three spaces inside.",
  "",
  "&nbsp;",
  "",
  "After one empty line.",
  "",
  "&nbsp;",
  "",
  "&nbsp;",
  "",
  "After two empty lines.",
  "",
  "- bullet one",
  "- bullet two",
  "  - nested bullet",
  "",
  "&nbsp;",
  "",
  "1. first",
  "2. second",
  "",
  "- [ ] open task",
  "- [x] done task",
  "",
  "```js",
  "const a = 1;",
  "",
  "",
  "  indented();",
  "```",
  "",
  "> a quote",
  ">",
  "> &nbsp;",
  ">",
  "> after an empty line in the quote",
  "",
  "Line one with a hard break\\",
  "line two after the break.",
  "",
  "A long paragraph that wraps across more than one line in the editor so the wrapping behaviour shows up in the screenshot, with a verylongwordwithoutanybreaksinsideitthatkeepsgoingandgoingandgoingandgoingandgoing at the end.",
  "",
].join("\n");

async function setup(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
  const decline = page.getByRole("button", { name: "Decline" }).first();
  if (await decline.isVisible().catch(() => false)) await decline.click();
  await page.getByRole("main", { name: "Note editor" }).getByRole("button", { name: "New note" }).click();
  await expect(editor(page)).toBeVisible();
  await page.getByTitle("View markdown source").click();
  await page.getByPlaceholder("# Markdown source").fill(SAMPLE);
  await page.getByTitle("View formatted").click();
  await expect(editor(page)).toContainText("verylongword");
  await page.mouse.click(1, 1); // no caret / focus ring in the shot
  await page.waitForTimeout(1500);
}

for (const scheme of ["light", "dark"] as const) {
  test(`editor rendering snapshot (${scheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 2200 });
    await page.emulateMedia({ colorScheme: scheme });
    await setup(page);
    fs.mkdirSync(OUT, { recursive: true });
    const info = await editor(page).evaluate((root) => {
      const r0 = root.getBoundingClientRect();
      const blocks: unknown[] = [];
      const walk = (el: Element, depth: number) => {
        for (const c of Array.from(el.children)) {
          const r = c.getBoundingClientRect();
          blocks.push({
            depth,
            tag: c.tagName.toLowerCase(),
            x: Math.round(r.left - r0.left),
            y: Math.round(r.top - r0.top),
            w: Math.round(r.width),
            h: Math.round(r.height),
            text: (c.textContent ?? "").replace(/ /g, "<nbsp>").slice(0, 60),
          });
          if (["ul", "ol", "li", "blockquote", "pre"].includes(c.tagName.toLowerCase())) walk(c, depth + 1);
        }
      };
      walk(root, 0);
      return { whiteSpace: getComputedStyle(root).whiteSpace, height: Math.round(r0.height), blocks };
    });
    fs.writeFileSync(path.join(OUT, `blocks-${scheme}.json`), JSON.stringify(info, null, 2));
    await editor(page).screenshot({ path: path.join(OUT, `editor-${scheme}.png`), animations: "disabled" });
  });
}
