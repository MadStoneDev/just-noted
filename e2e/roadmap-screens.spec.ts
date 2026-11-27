import { test, type Page } from "@playwright/test";

// Screenshot harness for the roadmap layout (not a check — skipped unless
// SHOTS_TAG is set). Guest visitor, dark theme, at 1440 / 1024 / 768 / 390:
//
//   SHOTS_TAG=after npx playwright test roadmap-screens
//
// Files land in docs/screenshots/roadmap-<viewport>-dark-<tag>.png. Below lg (tablet,
// phone) it also captures the Shipped list after tapping its tab.

const TAG = process.env.SHOTS_TAG;
const OUT = "docs/screenshots";

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  laptop: { viewport: { width: 1024, height: 768 } },
  tablet: { viewport: { width: 768, height: 1024 }, hasTouch: true },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
} as const;

async function dismissConsent(page: Page) {
  await page.getByRole("button", { name: "Decline" }).first().click({ timeout: 2_000 }).catch(() => {});
}

async function shoot(page: Page, name: string) {
  await dismissConsent(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}-${TAG}.png` });
}

test.describe("roadmap screenshots", () => {
  test.skip(!TAG, "screenshot harness: set SHOTS_TAG=before|after");

  for (const vp of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
    test(vp, async ({ browser }) => {
      const ctx = await browser.newContext({ ...VIEWPORTS[vp], colorScheme: "dark" });
      const page = await ctx.newPage();
      await page.goto("/roadmap");
      await page.getByRole("heading", { name: "Roadmap" }).first().waitFor();
      await page.locator("button[aria-pressed]").first().waitFor();
      await shoot(page, `roadmap-${vp}-dark`);

      const shippedTab = page.getByRole("tab", { name: /shipped/i });
      if ((vp === "phone" || vp === "tablet") && (await shippedTab.isVisible().catch(() => false))) {
        await shippedTab.click();
        await page.waitForTimeout(800);
        await shoot(page, `roadmap-${vp}-shipped-dark`);
      }
      await ctx.close();
    });
  }
});
