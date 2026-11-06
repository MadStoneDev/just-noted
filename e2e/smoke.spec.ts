import { test, expect } from "@playwright/test";

// Smoke: the app shell boots for an ANONYMOUS visitor and renders the notes app.
// A clean context is a signed-out visitor: there is NO account button (a "Log in"
// link instead), and no note is open yet (so no editor surface until one is
// created). Assertions below reflect that, and are specific enough to fail if the
// page is anything other than the notes app (e.g. a redirect or error page).
test.describe("app shell", () => {
  test("loads the notes app for an anonymous visitor", async ({ page }) => {
    await page.goto("/");

    // Notes-app markers (rail + main editor region).
    await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
    await expect(page.locator('main[aria-label="Note editor"]')).toBeVisible();

    // Signed-out: a Log in link, not an Account button.
    await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
    await expect(page.locator('button[aria-label="Account"]')).toHaveCount(0);

    // Not an error boundary.
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  });

  test("has no fatal console errors on first paint", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    // Fail if this isn't actually the notes app (so the error check isn't vacuous).
    await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
    // Allow network/analytics noise; fail on React/runtime errors.
    const fatal = errors.filter((e) => /(hydration|is not a function|cannot read|uncaught)/i.test(e));
    expect(fatal, fatal.join("\n")).toHaveLength(0);
  });
});
