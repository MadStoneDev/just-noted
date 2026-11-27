import { test, expect } from "./fixtures/no-conflicts";
import { seededAccounts, seedState, signIn } from "./fixtures/auth";

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

// ---- Stage 1 of the redesign: every panel closes on Esc, on a press outside
// and with its own control, and Esc / an outside press close only the topmost.

test.describe("dismiss contract (signed in)", () => {
  test.skip(() => !seedState()?.sharedNote, "needs the seeded account A and its note");

  test("bulk Move menu: Escape and an outside press close the menu only; Move toggles", async ({ page }) => {
    const [a] = seededAccounts();
    const { noteId } = seedState()!.sharedNote!;
    await signIn(page, a);
    await page.goto("/");
    const row = page.locator(`[data-note-card="${noteId}"]`);
    await expect(row).toBeVisible();

    await page.getByRole("button", { name: "Select", exact: true }).click();
    await row.click();
    const selected = page.getByText("1 selected");
    await expect(selected).toBeVisible();

    const move = page.getByRole("button", { name: "Move", exact: true });
    const menu = page.getByTestId("bulk-move-menu");

    await move.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(selected).toBeVisible(); // select mode survives
    await expect(move).toBeFocused(); // focus returns to the trigger

    await move.click();
    await expect(menu).toBeVisible();
    await page.getByRole("heading", { name: "All Notes" }).click();
    await expect(menu).toHaveCount(0);
    await expect(selected).toBeVisible();

    await move.click();
    await expect(menu).toBeVisible();
    await move.click(); // the trigger counts as inside: it toggles shut
    await expect(menu).toHaveCount(0);
  });

  test("phone: the swipe 'Move' sheet closes on Escape, leaving the list open", async ({ browser }) => {
    const [a] = seededAccounts();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await signIn(page, a);
    await page.goto("/");
    // Below lg the list opens as a full-width drawer on "/". Any of A's rows
    // will do: the sheet is closed again without moving anything.
    const item = page.locator("li").filter({ has: page.locator("[data-note-card]") }).first();
    const row = item.locator("[data-note-card]");
    await expect(row).toBeVisible();

    // Swipe the row right to reveal Pin / Move.
    const box = (await row.boundingBox())!;
    const y = box.y + box.height / 2;
    const cdp = await context.newCDPSession(page);
    const touch = (type: string, x: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y }],
      } as any);
    await touch("touchStart", box.x + 20);
    for (let x = box.x + 30; x <= box.x + 240; x += 30) await touch("touchMove", x);
    await touch("touchEnd", box.x + 240);

    // The revealed actions sit in an aria-hidden layer behind the row, so find
    // them by text within the swiped row's list item, not by role.
    await item.getByText("Move", { exact: true }).tap();
    const sheet = page.getByRole("dialog", { name: "Move to notebook" });
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(row).toBeVisible(); // Escape closed the sheet, not the list drawer under it

    await context.close();
  });
});
