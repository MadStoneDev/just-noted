import { test, expect, type Page } from "@playwright/test";

// Roadmap layout: the page fits the viewport and each list scrolls on its own
// (lg+ / 1024px: four columns; below: a tab bar over a scroll-snap strip). Guest visitor;
// relies on the local DB's published roadmap items (Shipped must overflow).

const LIST = (status: string) => `[data-testid="roadmap-list-${status}"]`;
const STRIP = '[data-testid="roadmap"] [role="tablist"] + div';
const ALL = ["under_review", "planned", "in_progress", "shipped"];

async function openRoadmap(page: Page) {
  await page.goto("/roadmap");
  await page.getByRole("heading", { name: "Roadmap" }).first().waitFor();
  await page.locator("button[aria-pressed]").first().waitFor();
  await page.getByRole("button", { name: "Decline" }).first().click({ timeout: 2_000 }).catch(() => {});
}

async function pageScrolls(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="roadmap"]') as HTMLElement;
    return {
      doc: document.scrollingElement!.scrollHeight > window.innerHeight + 1,
      root: root.scrollHeight > root.clientHeight + 1,
    };
  });
}

test.describe("roadmap — desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("fits the viewport; lists scroll on their own under a fixed header", async ({ page }) => {
    await openRoadmap(page);
    expect(await pageScrolls(page)).toEqual({ doc: false, root: false });
    await expect(page.getByRole("tablist")).toBeHidden();

    // Four columns side by side.
    const tops = await Promise.all(
      ALL.map(async (s) => (await page.locator(LIST(s)).boundingBox())!.y),
    );
    expect(new Set(tops).size).toBe(1);

    const shipped = page.locator(LIST("shipped"));
    const overflows = await shipped.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(overflows, "Shipped should hold more items than fit (seeded data)").toBe(true);
    const header = page.locator("section#roadmap-panel-shipped").getByText("Shipped", { exact: true });
    const before = (await header.boundingBox())!.y;
    await shipped.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => shipped.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect((await header.boundingBox())!.y).toBe(before);
    expect(await pageScrolls(page)).toEqual({ doc: false, root: false });
  });
});

test.describe("roadmap — lg breakpoint (1024)", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("all four columns fit without a sideways scroll", async ({ page }) => {
    await openRoadmap(page);
    await expect(page.getByRole("tablist")).toBeHidden();
    const boxes = await Promise.all(ALL.map(async (s) => (await page.locator(LIST(s)).boundingBox())!));
    expect(new Set(boxes.map((b) => b.y)).size).toBe(1);
    for (const s of ALL) await expect(page.locator(LIST(s))).toBeInViewport({ ratio: 1 });
    const board = await page.locator(STRIP).evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(board.sw).toBeLessThanOrEqual(board.cw);
    expect(await pageScrolls(page)).toEqual({ doc: false, root: false });
  });
});

test.describe("roadmap — just below lg (1023)", () => {
  test.use({ viewport: { width: 1023, height: 768 } });

  test("switches to the tabbed layout", async ({ page }) => {
    await openRoadmap(page);
    await expect(page.getByRole("tablist")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(4);
  });
});

test.describe("roadmap — tablet (768)", () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

  test("uses the tabbed layout: one full-width list, tabs drive it", async ({ page }) => {
    await openRoadmap(page);
    expect(await pageScrolls(page)).toEqual({ doc: false, root: false });
    await expect(page.getByRole("tab")).toHaveCount(4);
    await expect(page.getByRole("tab", { name: /In progress/ })).toHaveAttribute("aria-selected", "true");

    const width = await page.locator(STRIP).evaluate((el) => el.clientWidth);
    const panel = page.getByRole("tabpanel", { name: /In progress/ });
    await expect(panel).toBeInViewport({ ratio: 0.9 });
    expect((await panel.boundingBox())!.width).toBeCloseTo(width, 0);

    await page.getByRole("tab", { name: /Shipped/ }).click();
    await expect(page.getByRole("tab", { name: /Shipped/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: /Shipped/ })).toBeInViewport({ ratio: 0.9 });
    const shipped = page.locator(LIST("shipped"));
    await shipped.evaluate((el) => el.scrollBy(0, 400));
    await expect.poll(() => shipped.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await pageScrolls(page)).toEqual({ doc: false, root: false });
  });
});

test.describe("roadmap — phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  const scrollLeft = (page: Page) => page.locator(STRIP).evaluate((el) => el.scrollLeft);

  test("tabs drive the snap strip and follow swipes", async ({ page }) => {
    await openRoadmap(page);
    expect(await pageScrolls(page)).toEqual({ doc: false, root: false });

    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(4);
    for (const t of await tabs.all()) await expect(t).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("tab", { name: /Shipped\s*\d+/ })).toBeVisible();

    // Opens on In progress (seeded data has items there), panel in view.
    const inProgress = page.getByRole("tab", { name: /In progress/ });
    await expect(inProgress).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: /In progress/ })).toBeInViewport({ ratio: 0.9 });

    const barBefore = await page.getByRole("tablist").boundingBox();

    // Tap → scroll to that list.
    await page.getByRole("tab", { name: /Shipped/ }).click();
    await expect(page.getByRole("tab", { name: /Shipped/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: /Shipped/ })).toBeInViewport({ ratio: 0.9 });
    expect(await page.getByRole("tablist").boundingBox()).toEqual(barBefore); // no layout shift

    // The list scrolls vertically on its own; the tab bar stays put.
    const shipped = page.locator(LIST("shipped"));
    await shipped.evaluate((el) => el.scrollBy(0, 400));
    await expect.poll(() => shipped.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await page.getByRole("tablist").boundingBox()).toEqual(barBefore);

    // Swipe (scroll the strip) → active tab follows.
    await page.locator(STRIP).evaluate((el) => el.scrollTo({ left: 0 }));
    await expect(page.getByRole("tab", { name: /Under review/ })).toHaveAttribute("aria-selected", "true");
    expect(await scrollLeft(page)).toBe(0);

    // Keyboard: arrows move focus + selection (roving tabindex), End/Home jump.
    await page.getByRole("tab", { name: /Under review/ }).focus();
    await page.keyboard.press("ArrowRight");
    const planned = page.getByRole("tab", { name: /Planned/ });
    await expect(planned).toBeFocused();
    await expect(planned).toHaveAttribute("aria-selected", "true");
    await expect(planned).toHaveAttribute("tabindex", "0");
    await expect(page.getByRole("tab", { name: /Under review/ })).toHaveAttribute("tabindex", "-1");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft"); // wraps
    await expect(page.getByRole("tab", { name: /Shipped/ })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.getByRole("tab", { name: /Under review/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: /Under review/ })).toBeInViewport({ ratio: 0.9 });
  });

  test("reduced motion: tab taps jump without a smooth scroll", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openRoadmap(page);
    const width = await page.locator(STRIP).evaluate((el) => el.clientWidth);
    await page.getByRole("tab", { name: /Under review/ }).click();
    // Checked synchronously after the click: a smooth scroll would still be in flight.
    expect(await scrollLeft(page)).toBe(0);
    await page.getByRole("tab", { name: /Shipped/ }).click();
    expect(await scrollLeft(page)).toBe(3 * width);
  });
});
