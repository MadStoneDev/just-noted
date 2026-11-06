import { test, expect } from "@playwright/test";

// Smoke: the app shell boots for an anonymous visitor and renders the editor
// region. Grounded only in selectors that exist in the app today, so it runs
// green without a seeded account. Expand real flows in core-flows.spec.ts.
test.describe("app shell", () => {
  test("loads and shows the note editor region", async ({ page }) => {
    await page.goto("/");

    // The main area is labelled "Note editor" for a signed-out visitor (it only
    // becomes "Shared note" when a shared note is open).
    const editorRegion = page.locator('main[aria-label="Note editor"]');
    await expect(editorRegion).toBeVisible();

    // The account control is always mounted in the rail.
    await expect(page.locator('button[aria-label="Account"]')).toBeVisible();

    // No unhandled client error boundary fallback.
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  });

  test("has no console errors on first paint", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.locator('main[aria-label="Note editor"]').waitFor();
    // Allow network/analytics noise but fail on React/runtime errors.
    const fatal = errors.filter((e) => /(hydration|is not a function|cannot read|uncaught)/i.test(e));
    expect(fatal, fatal.join("\n")).toHaveLength(0);
  });
});
