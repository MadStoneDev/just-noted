import type { Browser, BrowserContext, Page } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";
import { test } from "./fixtures/no-conflicts";
import { seededAccounts, signIn } from "./fixtures/auth";
import { adminClient } from "./fixtures/admin";

// Screenshot harness for the small-text / muted-contrast pass (not a check —
// skipped unless SHOTS_TAG is set). Seeds A with a notebook, live notes, trashed
// notes and versions, then captures Trash, the sidebar, Version history and
// Settings at desktop and phone width, dark theme (plus Trash in light):
//
//   SHOTS_TAG=after npx playwright test typography-screens
//
// Files land in docs/screenshots/<surface>-<viewport>-<theme>-<tag>.png.

const TAG = process.env.SHOTS_TAG;
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3050";
const OUT = "docs/screenshots";
const DAY = 86_400_000;

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
} as const;

async function seed(author: string) {
  const db = adminClient();
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const nb = uuidv4();
  await db.from("notebooks").insert({ id: nb, owner: author, name: "Field notes from the coast" });

  const words = (n: number) => Array.from({ length: n }, (_, i) => ["tide", "harbour", "gull", "salt", "rope"][i % 5]).join(" ");
  const live = [
    { title: "Morning pages", content: words(412), notebook_id: nb, updated_at: iso(2 * 60_000) },
    { title: "Draft: harbour essay with a deliberately long title that should truncate", content: words(1837), notebook_id: nb, updated_at: iso(3 * 3_600_000) },
    { title: "Grocery list", content: words(18), notebook_id: null, updated_at: iso(2 * DAY) },
  ].map((n) => ({ id: uuidv4(), author, content_format: "markdown", ...n }));
  const trashed = [
    { title: "Old meeting notes", content: words(240), notebook_id: nb, deleted_at: iso(3 * 3_600_000) },
    { title: "A very long abandoned outline title that keeps going and going", content: words(980), notebook_id: nb, deleted_at: iso(9 * DAY) },
    { title: "Scratch", content: words(6), notebook_id: null, deleted_at: iso(26 * DAY) },
  ].map((n) => ({ id: uuidv4(), author, content_format: "markdown", ...n }));
  const { error } = await db.from("notes").insert([...live, ...trashed]);
  if (error) throw error;

  const versions = [5, 40, 26 * 60, 3 * 24 * 60].map((minAgo, i) => ({
    note_id: live[1].id,
    author,
    title: live[1].title,
    content: words(1837 - i * 150),
    content_format: "markdown",
    reason: "autosave",
    created_at: iso(minAgo * 60_000),
  }));
  await db.from("note_versions").insert(versions);
  return { historyNote: live[1].title as string };
}

async function dismissConsent(page: Page) {
  await page.getByRole("button", { name: "Decline" }).first().click({ timeout: 2_000 }).catch(() => {});
}

async function openTrash(page: Page) {
  await dismissConsent(page);
  await page.getByTitle("Trash").first().click({ timeout: 10_000 });
  await page.getByRole("heading", { name: "Trash" }).first().waitFor({ timeout: 10_000 });
  await page.getByText("Old meeting notes").first().waitFor({ timeout: 10_000 });
}

async function shoot(page: Page, name: string, fullPage = false) {
  await dismissConsent(page); // the banner can appear late; keep it off the shot
  await page.waitForTimeout(600); // let fades/animations settle
  await page.screenshot({ path: `${OUT}/${name}-${TAG}.png`, fullPage });
}

async function open(browser: Browser, vp: keyof typeof VIEWPORTS, theme: "dark" | "light"): Promise<{ ctx: BrowserContext; page: Page }> {
  const [acc] = seededAccounts();
  const ctx = await browser.newContext({ ...VIEWPORTS[vp], colorScheme: theme });
  await signIn(ctx, acc, { baseURL: BASE_URL });
  const page = await ctx.newPage();
  await page.goto(BASE_URL + "/");
  await page.getByRole("heading", { name: "All Notes" }).first().waitFor();
  await dismissConsent(page);
  return { ctx, page };
}

test.describe("typography screenshots", () => {
  test.skip(!TAG, "screenshot harness: set SHOTS_TAG=before|after");
  test.describe.configure({ mode: "serial" });
  test.setTimeout(240_000);

  let historyNote = "";
  test.beforeAll(async () => {
    const [acc] = seededAccounts();
    ({ historyNote } = await seed(acc.id));
  });

  for (const vp of ["desktop", "phone"] as const) {
    test(`${vp}`, async ({ browser }) => {
      const { ctx, page } = await open(browser, vp, "dark");
      const step = async (label: string, fn: () => Promise<void>) => {
        try {
          await fn();
        } catch (e) {
          console.warn(`[shots] ${vp} ${label} skipped: ${(e as Error).message.split("\n")[0]}`);
        }
      };

      await step("sidebar", async () => {
        await page.getByRole("heading", { name: historyNote, exact: true }).first().waitFor();
        await shoot(page, `sidebar-${vp}-dark`);
      });

      await step("trash", async () => {
        await openTrash(page);
        await shoot(page, `trash-${vp}-dark`, true);
      });

      await step("version history", async () => {
        await page.goto(BASE_URL + "/");
        await page.getByRole("heading", { name: historyNote, exact: true }).first().click({ timeout: 10_000 });
        await page.waitForTimeout(1500);
        const btn = page.locator('button[title="Version history"]').first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click({ timeout: 10_000 });
        } else {
          // Phone: no action-bar button; it's in the top bar's More sheet.
          await page.getByRole("button", { name: "More" }).first().click({ timeout: 10_000 });
          await page.getByText("Version history", { exact: true }).first().click({ timeout: 10_000 });
        }
        const panel = page.getByRole("dialog", { name: "Version history" });
        await panel.getByText(/ago|just now/i).first().waitFor({ timeout: 10_000 });
        await shoot(page, `version-history-${vp}-dark`);
        await panel.locator("button").filter({ hasText: /ago/i }).first().click({ timeout: 5_000 });
        await shoot(page, `version-history-preview-${vp}-dark`);
      });

      for (const section of ["Appearance", "Account", "Plan & usage"]) {
        await step(`settings ${section}`, async () => {
          await page.goto(`${BASE_URL}/settings?section=${encodeURIComponent(section)}`);
          await page.getByRole("heading").filter({ hasText: section }).first().waitFor({ timeout: 15_000 });
          await shoot(page, `settings-${section.toLowerCase().replace(/[^a-z]+/g, "-")}-${vp}-dark`, true);
        });
      }
      await ctx.close();

      if (vp === "desktop") {
        const light = await open(browser, vp, "light");
        await step("trash light", async () => {
          await openTrash(light.page);
          await shoot(light.page, `trash-${vp}-light`, true);
        });
        await light.ctx.close();
      }
    });
  }
});
