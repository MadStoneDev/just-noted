import type { Browser, BrowserContext, Page } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";
import { test } from "./fixtures/no-conflicts";
import { seededAccounts, signIn } from "./fixtures/auth";
import { adminClient } from "./fixtures/admin";

// Screenshot harness for the sidebar + modals redesign (docs/redesign/PLAN.md).
// Not a check: skipped unless SHOTS_TAG is set. Each stage adds its surfaces.
//
//   SHOTS_TAG=before npx playwright test redesign-screens
//   SHOTS_TAG=after  npx playwright test redesign-screens
//
// Files land in docs/screenshots/redesign-<surface>-<viewport>-<theme>-<tag>.png.
//
// Stage 1 (fonts): --font-meta now loads IBM Plex Mono. Before, it named
// JetBrains Mono, which was never loaded, so it fell back to the OS monospace.
// SHOTS_TAG=before puts that old value back on the same build, so both sets
// come from one build.
//
// Wordmark preview (not shipped; needs sign-off before Playfair is dropped):
//
//   SHOTS_WORDMARK=1 npx playwright test redesign-screens -g wordmark
//
// writes docs/screenshots/wordmark-<surface>-<theme>-{playfair,newsreader600}.png.

const TAG = process.env.SHOTS_TAG;
const WORDMARK = process.env.SHOTS_WORDMARK === "1";
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3050";
const OUT = "docs/screenshots";

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
} as const;
const THEMES = ["dark", "light"] as const;

// The pre-Stage-1 --font-meta: an unloaded family, i.e. the OS monospace.
const OLD_META_FONT = `:root { --font-meta: "JetBrains Mono", ui-monospace, monospace !important; }`;
// The proposed wordmark: Newsreader 600 in place of Playfair Display.
const NEWSREADER_WORDMARK = `.font-brand { font-family: var(--font-newsreader), Georgia, serif !important; font-weight: 600 !important; }`;

async function dismissConsent(page: Page) {
  await page.getByRole("button", { name: "Decline" }).first().click({ timeout: 2_000 }).catch(() => {});
}

async function settle(page: Page) {
  await dismissConsent(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600); // fades/animations
}

async function seed(author: string) {
  const db = adminClient();
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const nb = uuidv4();
  await db.from("notebooks").insert({ id: nb, owner: author, name: "GoingDark" });
  const words = (n: number) => Array.from({ length: n }, (_, i) => ["night", "thermal", "vision", "heat", "light"][i % 5]).join(" ");
  const notes = [
    { title: "03-article-nv-vs-thermal", content: `TL;DR. Night vision sees light while thermal sees heat.\n\n${words(941)}`, notebook_id: nb, updated_at: iso(60_000) },
    { title: "Does Night Vision or Thermal Work in Daylight?", content: `Thermal works in daylight.\n\n${words(620)}`, notebook_id: nb, updated_at: iso(3 * 3_600_000) },
    { title: "One-off maintenance", content: words(40), notebook_id: null, updated_at: iso(3 * 86_400_000) },
  ].map((n) => ({ id: uuidv4(), author, content_format: "markdown", ...n }));
  const { error } = await db.from("notes").insert(notes);
  if (error) throw error;
  return notes[0];
}

async function openApp(browser: Browser, vp: keyof typeof VIEWPORTS, theme: (typeof THEMES)[number]): Promise<{ ctx: BrowserContext; page: Page }> {
  const [acc] = seededAccounts();
  const ctx = await browser.newContext({ ...VIEWPORTS[vp], colorScheme: theme });
  await signIn(ctx, acc, { baseURL: BASE_URL });
  const page = await ctx.newPage();
  await page.goto(BASE_URL + "/");
  await page.getByRole("heading", { name: "All Notes" }).first().waitFor();
  if (TAG === "before") await page.addStyleTag({ content: OLD_META_FONT });
  await dismissConsent(page);
  return { ctx, page };
}

test.describe("redesign screenshots", () => {
  test.skip(!TAG, "screenshot harness: set SHOTS_TAG=before|after");
  test.describe.configure({ mode: "serial" });
  test.setTimeout(240_000);

  let title = "";
  test.beforeAll(async () => {
    const [acc] = seededAccounts();
    ({ title } = await seed(acc.id));
  });

  for (const vp of ["desktop", "phone"] as const) {
    for (const theme of THEMES) {
      test(`stage 1 fonts: sidebar + editor meta, ${vp} ${theme}`, async ({ browser }) => {
        const { ctx, page } = await openApp(browser, vp, theme);
        // Sidebar list: row meta (dates, storage) and the footer count.
        await page.getByText(title).first().waitFor();
        await settle(page);
        await page.screenshot({ path: `${OUT}/redesign-sidebar-${vp}-${theme}-${TAG}.png` });
        // Editor: the stats line under the title (words · min · pages).
        await page.getByText(title).first().click();
        await page.locator('main[aria-label="Note editor"]').waitFor();
        await settle(page);
        await page.screenshot({ path: `${OUT}/redesign-editor-${vp}-${theme}-${TAG}.png` });
        await ctx.close();
      });
    }
  }
});

test.describe("wordmark preview", () => {
  test.skip(!WORDMARK, "set SHOTS_WORDMARK=1");
  test.describe.configure({ mode: "serial" });

  for (const theme of THEMES) {
    test(`wordmark ${theme}`, async ({ browser }) => {
      const ctx = await browser.newContext({ ...VIEWPORTS.desktop, colorScheme: theme });
      const page = await ctx.newPage();
      const shots: [string, string, () => ReturnType<Page["locator"]>][] = [
        ["header", "/welcome", () => page.locator("header").first()],
        ["404", "/x/y/z-not-found", () => page.locator("h1", { hasText: "404" }).locator("xpath=../..")],
      ];
      for (const [surface, path, target] of shots) {
        for (const variant of ["playfair", "newsreader600"] as const) {
          await page.goto(BASE_URL + path);
          if (variant === "newsreader600") await page.addStyleTag({ content: NEWSREADER_WORDMARK });
          await settle(page);
          // Page clip with a margin rather than an element shot: a display face
          // can draw outside its line box, and an element shot would crop that.
          const box = (await target().boundingBox())!;
          const m = surface === "header" ? 0 : 40;
          await page.screenshot({
            path: `${OUT}/wordmark-${surface}-${theme}-${variant}.png`,
            clip: { x: Math.max(0, box.x - m), y: Math.max(0, box.y - m), width: box.width + 2 * m, height: box.height + 2 * m },
          });
        }
      }
      await ctx.close();
    });
  }
});
