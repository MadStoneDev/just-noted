import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/no-conflicts";

// Markdown round-trip: content typed into a note must come back byte-for-byte
// (stored markdown) and node-for-node (rendered DOM) after every reload — and
// after the edit that follows a reload, which is when the editor writes its own
// re-serialisation of the loaded doc back to storage.
//
// Regression for: a bullet line "- two" typed into an existing list saved as
// "- \- two"; the load path stripped the escape, so it reloaded as a nested
// list under an empty bullet, and each reload+edit corrupted it further. Also
// covers tight lists coming back loose, and bullets vanishing from a list that
// mixes bullets and tasks.
//
// Runs as an anonymous (local, Redis-backed) user — see e2e/README.md.

const EDITOR = ".ProseMirror";
const editor = (page: Page) => page.locator(EDITOR).first();

async function waitForApp(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
}

async function createFirstNote(page: Page): Promise<void> {
  await page
    .getByRole("main", { name: "Note editor" })
    .getByRole("button", { name: "New note" })
    .click();
  await expect(editor(page)).toBeVisible();
}

/** Wait for the editor's debounced change + autosave to land. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(1500);
  await expect
    .poll(() => page.evaluate(() => /Saving/.test(document.getElementById("main-content")?.textContent ?? "")))
    .toBe(false);
  await page.waitForTimeout(500);
}

/** Type lines into the rich editor. "<TAB>"/"<S-TAB>" prefixes indent/outdent. */
async function typeLines(page: Page, lines: string[]): Promise<void> {
  await editor(page).click();
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) await page.keyboard.press("Enter");
    let line = lines[i];
    for (;;) {
      if (line.startsWith("<TAB>")) {
        await page.keyboard.press("Tab");
        line = line.slice(5);
      } else if (line.startsWith("<S-TAB>")) {
        await page.keyboard.press("Shift+Tab");
        line = line.slice(7);
      } else break;
    }
    await page.keyboard.type(line);
  }
}

const sourceToggle = (page: Page) => page.getByTitle("View markdown source");
const formattedToggle = (page: Page) => page.getByTitle("View formatted");
const sourceArea = (page: Page) => page.getByPlaceholder("# Markdown source");

/** Write markdown through "View markdown source", then return to the editor. */
async function typeSource(page: Page, markdown: string): Promise<void> {
  await sourceToggle(page).click();
  await sourceArea(page).fill(markdown);
  await formattedToggle(page).click();
  await expect(editor(page)).toBeVisible();
}

/**
 * The note's markdown, as "View markdown source" shows it. Trailing blank lines
 * are normalised to one newline: a note ending in a list or code block gets an
 * invisible trailing empty paragraph (Milkdown's trailing plugin), which saves
 * as one extra blank line. It carries no meaning and is stable once written.
 */
async function readMarkdown(page: Page): Promise<string> {
  await sourceToggle(page).click();
  const md = await sourceArea(page).inputValue();
  await formattedToggle(page).click();
  await expect(editor(page)).toBeVisible();
  return md.replace(/\n+$/, "\n");
}

/** Click a task item's checkbox (drawn by li::before, left of the text). */
async function toggleTask(page: Page, text: string): Promise<void> {
  const li = editor(page).locator('li[data-item-type="task"]', { hasText: text }).last();
  const box = await li.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const before = getComputedStyle(el, "::before");
    return { left: parseFloat(before.left), top: parseFloat(before.top), w: parseFloat(before.width), h: r.height };
  });
  await li.click({ position: { x: box.left + box.w / 2, y: box.top + box.w / 2 } });
}

/**
 * A structural snapshot of the rendered note: element tags, list-item kind,
 * checked state, each item's visible marker (bullet vs. none), and text.
 */
async function domSnapshot(page: Page): Promise<string> {
  return editor(page).evaluate((root) => {
    const walk = (node: Node, depth: number): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent ?? "";
        return t.trim() ? `${"  ".repeat(depth)}"${t}"\n` : "";
      }
      if (!(node instanceof HTMLElement)) return "";
      if (node.classList.contains("ProseMirror-trailingBreak")) return "";
      let label = node.tagName.toLowerCase();
      if (label === "li") {
        const task = node.dataset.itemType === "task";
        label += task
          ? `[task checked=${node.dataset.checked}]`
          : `[marker=${getComputedStyle(node).listStyleType}]`;
      }
      let out = `${"  ".repeat(depth)}${label}\n`;
      node.childNodes.forEach((c) => (out += walk(c, depth + 1)));
      return out;
    };
    let out = "";
    root.childNodes.forEach((c) => (out += walk(c, 0)));
    return out;
  });
}

/**
 * Reload, then make an edit and undo it by hand (type at the end, delete it):
 * the editor re-serialises and saves the whole loaded doc, which is how a load
 * bug becomes stored damage.
 */
async function reloadAndResave(page: Page, mustContain: string): Promise<void> {
  await page.reload();
  await waitForApp(page);
  await expect(editor(page)).toContainText(mustContain, { timeout: 20_000 });
  // The first change within 1s of the editor mounting is treated as its load
  // re-serialisation, not an edit (decideEditorChange) — edit after that.
  await page.waitForTimeout(1500);
  await editor(page).locator("p, pre, h1").last().click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("x");
  await settle(page);
  await page.keyboard.press("Backspace");
  await settle(page);
}

interface Case {
  name: string;
  input: (page: Page) => Promise<void>;
  markdown: string;
  /** Text visible in the note once loaded (to know the reload finished). */
  probe: string;
  check?: (snapshot: string) => void;
}

const CASES: Case[] = [
  {
    name: "bullet-only",
    input: (p) => typeLines(p, ["- one", "two", "three"]),
    markdown: "- one\n- two\n- three\n",
    probe: "three",
  },
  {
    name: "task-only",
    input: async (p) => {
      await typeLines(p, ["- [ ] a", "b", "c"]);
      await toggleTask(p, "b");
    },
    markdown: "- [ ] a\n- [x] b\n- [ ] c\n",
    probe: "c",
  },
  {
    name: "mixed bullet + task (bullets stay visible)",
    input: async (p) => {
      await typeLines(p, ["- one", "two", "[ ] task item"]);
      await toggleTask(p, "task item");
    },
    markdown: "- one\n- two\n- [x] task item\n",
    probe: "task item",
    check: (snap) => {
      expect(snap.match(/li\[marker=disc\]/g)).toHaveLength(2);
      expect(snap).toContain("li[task checked=true]");
    },
  },
  {
    name: "reported repro: - one / - two / [ ] task item",
    input: (p) => typeLines(p, ["- one", "- two", "[ ] task item"]),
    // "- " typed inside a bullet is literal text, so it is stored escaped and
    // must stay a sibling item — never a nested list under an empty bullet.
    markdown: "- one\n- \\- two\n- [ ] task item\n",
    probe: "task item",
    check: (snap) => {
      expect(snap).not.toMatch(/li[^\n]*\n\s+ul/);
      expect(snap).toContain('"- two"');
    },
  },
  {
    name: "nested bullets",
    input: (p) => typeLines(p, ["- parent", "<TAB>child", "<TAB>grandchild", "<S-TAB><S-TAB>sibling"]),
    markdown: "- parent\n  - child\n    - grandchild\n- sibling\n",
    probe: "sibling",
  },
  {
    name: "nested tasks",
    input: async (p) => {
      await typeLines(p, ["- [ ] parent", "<TAB>child", "<S-TAB>sibling"]);
      await toggleTask(p, "child");
    },
    markdown: "- [ ] parent\n  - [x] child\n- [ ] sibling\n",
    probe: "sibling",
  },
  {
    name: "numbered",
    input: (p) => typeLines(p, ["1. one", "two", "three"]),
    markdown: "1. one\n2. two\n3. three\n",
    probe: "three",
  },
  {
    name: "nested numbered",
    input: (p) => typeLines(p, ["1. one", "<TAB>sub", "<S-TAB>two"]),
    markdown: "1. one\n   1. sub\n2. two\n",
    probe: "two",
  },
  {
    name: "list after a heading",
    input: (p) => typeLines(p, ["# Title", "- one", "two"]),
    markdown: "# Title\n\n- one\n- two\n",
    probe: "two",
  },
  {
    name: "literal \\- and \\*not em\\* (via markdown source)",
    input: (p) => typeSource(p, "- one\n- \\- two\n\na \\*not em\\* b\n"),
    markdown: "- one\n- \\- two\n\na \\*not em\\* b\n",
    probe: "not em",
    check: (snap) => {
      expect(snap).not.toContain("em\n");
      expect(snap).toContain('"a *not em* b"');
    },
  },
  {
    name: "code block containing backslashes (via markdown source)",
    input: (p) => typeSource(p, "```\nC:\\Users\\me\\notes\n\\- not an escape\necho \"a\\\\b\"\n```\n"),
    markdown: "```\nC:\\Users\\me\\notes\n\\- not an escape\necho \"a\\\\b\"\n```\n",
    probe: "not an escape",
  },
];

test.describe("markdown round-trip — local (Redis, anonymous)", () => {
  for (const c of CASES) {
    test(c.name, async ({ page }) => {
      await page.goto("/");
      await waitForApp(page);
      await createFirstNote(page);

      await c.input(page);
      await settle(page);

      expect(await readMarkdown(page)).toBe(c.markdown);
      const dom = await domSnapshot(page);
      c.check?.(dom);

      for (let i = 1; i <= 3; i++) {
        await reloadAndResave(page, c.probe);
        expect(await readMarkdown(page), `markdown after reload ${i}`).toBe(c.markdown);
        expect(await domSnapshot(page), `rendered DOM after reload ${i}`).toBe(dom);
      }
    });
  }
});
