import { test, expect } from "./fixtures/no-conflicts";

// Escape closes the topmost open popover, modal or drawer only, and never
// collapses the sidebar.

test("Escape never collapses the sidebar; it closes only the topmost layer", async ({ page }) => {
  await page.goto("/");
  const sidebarHeading = page.getByRole("heading", { name: "All Notes" });
  await expect(sidebarHeading).toBeVisible();

  // Nothing open: Escape leaves the sidebar alone.
  await page.locator("body").press("Escape");
  await page.waitForTimeout(300);
  await expect(sidebarHeading).toBeVisible();

  // Search open: Escape closes the search, and only the search.
  await page.locator("body").press("Control+k");
  const search = page.getByRole("dialog", { name: "Search notes" });
  await expect(search).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(search).toHaveCount(0);
  await expect(sidebarHeading).toBeVisible();

  // Help, then its keyboard-shortcuts page: Escape steps back to the menu,
  // then closes Help; the sidebar stays open throughout.
  await page.evaluate(() => window.dispatchEvent(new Event("justnoted:open-help")));
  const help = page.getByRole("dialog", { name: "Help" });
  await expect(help).toBeVisible();
  await help.getByRole("button", { name: "Keyboard shortcuts" }).click();
  await expect(help.getByText("Create new note")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help.getByText("Create new note")).toHaveCount(0);
  await expect(help.getByRole("button", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(sidebarHeading).toBeVisible();
});
