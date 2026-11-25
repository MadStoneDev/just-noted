import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/no-conflicts";
import { seededAccounts, signIn, type SeededAccount } from "./fixtures/auth";
import { adminClient } from "./fixtures/admin";

// Release smoke test f4, reproduced exactly: two accounts on this device, the
// browser really offline (navigator.onLine === false, every request fails, as
// with DevTools → Network → Offline), a line typed into a cloud note, and a
// sign-out from the accounts menu less than a second later, while the editor's
// 2 s autosave debounce still holds the line.
//
// The chosen sign-out must not lose that line (src/utils/sign-out.ts): the
// dialog holds the sign-out ("Couldn’t sync 1 note" / "Sign out anyway — 1
// unsaved note will be lost"), Cancel keeps the account signed in, and once the
// network is back the line reaches the server.
//
//   (a) sign out of the ACTIVE account from the accounts menu within 1 s of
//       typing (the line is still in the editor's debounce).
//   (a2) the same a few seconds after typing, as in the smoke test: the save
//       has already failed and queued the line. After Cancel and reconnecting,
//       the open note's editor retries its failed save (the queue leaves a
//       note an editor owns to that editor).
//   (a3) "Sign out anyway" offline: the account is signed out in place, with
//       no page load (which would only show the browser's offline page); the
//       navigation to "/" waits for the connection.
//   (b) remove the NON-ACTIVE account (accounts menu → Manage accounts →
//       Remove) within 1 s of the line: the active account must stay signed
//       in, nothing does a full page load, and the line still lands.
//
// (b) is marked test.fail until docs/tickets/settings-unreachable-offline.md is
// fixed: Settings can't be opened offline (a full page load of /settings).

const MAIN = 'main[aria-label="Note editor"]';
const EDITOR = `${MAIN} .ProseMirror`;

const norm = (s: string | null | undefined) => (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const activeId = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-note-card][data-active="true"]')?.getAttribute("data-note-card") ?? null);
const editorFocused = (page: Page) => page.evaluate(() => !!document.activeElement?.closest(".ProseMirror"));
const saveStatus = (page: Page) => page.locator(`${MAIN} [data-testid="save-status"]`);
const accountButton = (page: Page) => page.locator('button[aria-label="Account"]:visible').first();

async function cloudServerContent(noteId: string): Promise<string | null> {
  const { data } = await adminClient().from("notes").select("content").eq("id", noteId).maybeSingle();
  return (data as { content: string } | null)?.content ?? null;
}

async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible({ timeout: 30_000 });
  const decline = page.getByRole("button", { name: "Decline" }).first();
  if (await decline.isVisible().catch(() => false)) await decline.click();
}

/** A cloud note holding `text`, synced. Returns its id. */
async function createCloudNote(page: Page, text: string): Promise<string> {
  await expect(page.locator("[data-note-card]").first()).toBeVisible();
  await page.waitForTimeout(1000);
  const before = await activeId(page);
  await page.locator("body").press("Control+j");
  await expect.poll(() => activeId(page)).not.toBe(before);
  await expect.poll(() => editorFocused(page)).toBe(true);
  const id = (await activeId(page))!;
  await page.keyboard.type(text, { delay: 15 });
  await expect.poll(async () => norm(await cloudServerContent(id)), { timeout: 15_000 }).toBe(text);
  await expect(saveStatus(page)).toHaveText("Synced", { timeout: 15_000 });
  return id;
}

/**
 * Record every full page load (the bug hard-navigates to "/" while offline,
 * which shows the browser's offline page). Client-side route changes don't count.
 */
function trackNavigations(page: Page): string[] {
  const navs: string[] = [];
  // A document request in the main frame is a full page load (it fails offline,
  // so "load" never fires); Next's client route changes fetch RSC, not documents.
  page.on("request", (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) navs.push(r.url());
  });
  return navs;
}

test.describe("f4: chosen sign-out while offline, two accounts on the device", () => {
  test.skip(seededAccounts().length < 2, "needs two seeded accounts (service-role key)");
  let a: SeededAccount;
  let b: SeededAccount;
  test.beforeEach(() => {
    [a, b] = seededAccounts();
  });

  async function setUp(page: Page) {
    await signIn(page, a, { alsoOnDevice: [b] });
    await openApp(page);
    await expect(accountButton(page)).toBeVisible();
    const id = await createCloudNote(page, "f4 base");
    // Both accounts are listed in the accounts menu.
    await accountButton(page).click();
    await expect(page.getByRole("button", { name: `Sign out of @${a.handle}` })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`@${b.handle}`) })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: `Sign out of @${a.handle}` })).toBeHidden();
    return id;
  }

  /** Go offline, then type a line at the end of the open note. Returns the full expected text. */
  async function typeOffline(page: Page, suffix: string): Promise<string> {
    await page.context().setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await page.locator(EDITOR).click();
    await page.keyboard.press("End");
    await page.keyboard.type(suffix, { delay: 10 });
    return `f4 base${suffix}`;
  }

  async function signOutActiveOffline(page: Page, suffix: string, waitMs: number) {
    const id = await setUp(page);
    const navs = trackNavigations(page);
    const EXPECTED = await typeOffline(page, suffix);
    if (waitMs) {
      await page.waitForTimeout(waitMs);
      await expect(saveStatus(page), "the offline save has failed").toHaveText("Not saved", { timeout: 10_000 });
    }

    const t0 = Date.now();
    await accountButton(page).click();
    await page.getByRole("button", { name: `Sign out of @${a.handle}` }).click();
    if (!waitMs) expect(Date.now() - t0, "signed out within 1 s of typing").toBeLessThan(1000);

    const dialog = page.getByTestId("sign-out-dialog");
    await expect(dialog, "the sign-out is held for the unsynced line").toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole("button", { name: "Sign out anyway — 1 unsaved note will be lost" })).toBeVisible({
      timeout: 20_000,
    });
    expect(navs, "no page load while the dialog is up").toEqual([]);

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(accountButton(page), "still signed in").toBeVisible();

    await page.context().setOffline(false);
    await expect.poll(async () => norm(await cloudServerContent(id)), { timeout: 30_000 }).toBe(EXPECTED);
    expect(navs, "no page load at all").toEqual([]);
  }

  test("(a) sign out of the active account from the accounts menu within 1 s: dialog holds it, Cancel keeps the line", async ({ page }) => {
    test.setTimeout(120_000);
    await signOutActiveOffline(page, " typed offline", 0);
  });

  test("(a2) sign out of the active account a few seconds after typing offline: dialog holds it, Cancel keeps the line", async ({ page }) => {
    test.setTimeout(120_000);
    await signOutActiveOffline(page, " typed offline a2", 3000);
  });

  test("(a3) 'Sign out anyway' offline signs out in place; the page load waits for the connection", async ({ page }) => {
    test.setTimeout(120_000);
    const id = await setUp(page);
    const navs = trackNavigations(page);
    await typeOffline(page, " lost by choice");

    await accountButton(page).click();
    await page.getByRole("button", { name: `Sign out of @${a.handle}` }).click();
    const dialog = page.getByTestId("sign-out-dialog");
    const anyway = dialog.getByRole("button", { name: "Sign out anyway — 1 unsaved note will be lost" });
    await expect(anyway).toBeVisible({ timeout: 20_000 });
    await anyway.click();

    await expect(accountButton(page), "signed out").toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "All Notes" }), "still the app, not the offline page").toBeVisible();
    await expect(page.locator(`[data-note-card="${id}"]`), "the account's notes are gone").toHaveCount(0);
    expect(navs, "no page load while offline").toEqual([]);
    expect(norm(await cloudServerContent(id)), "the discarded line never reached the server").toBe("f4 base");

    // Back online: the sign-out's navigation to "/" happens now.
    const loaded = page.waitForEvent("load", { timeout: 30_000 });
    await page.context().setOffline(false);
    await loaded;
    await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible({ timeout: 30_000 });
    await expect(accountButton(page), "still signed out after the reload").toBeHidden();
  });

  test("(b) remove the non-active account within 1 s of an offline line: active account and its line untouched", async ({ page }) => {
    test.fail(true, "docs/tickets/settings-unreachable-offline.md: Manage accounts offline is a full page load of /settings");
    test.setTimeout(120_000);
    const id = await setUp(page);
    const navs = trackNavigations(page);
    const EXPECTED = await typeOffline(page, " typed offline b");

    // Accounts menu → Manage accounts → Remove the other account, within 1 s.
    const t0 = Date.now();
    await accountButton(page).click();
    await page.getByRole("button", { name: "Manage accounts" }).click();
    const accountSection = page.getByRole("button", { name: "Account", exact: true });
    await expect(accountSection, "Settings opens offline").toBeVisible({ timeout: 10_000 });
    await accountSection.click({ timeout: 5_000 });
    expect(navs, "Settings opens without a full page load").toEqual([]);
    const remove = page.getByTitle("Remove from this device");
    await expect(remove, "only the non-active account is removable").toHaveCount(1, { timeout: 5_000 });
    const row = page.locator("div.flex.items-center", { has: remove });
    await expect(row).toContainText(`@${b.handle}`);
    await remove.click();
    expect(Date.now() - t0, "removed within 1 s of typing").toBeLessThan(1000);

    await expect(page.getByTitle("Remove from this device"), "the other account left the device list").toHaveCount(0);
    await expect(page.getByTestId("sign-out-dialog"), "removing another account never signs this one out").toHaveCount(0);
    await expect(accountButton(page), "still signed in").toBeVisible();

    await page.context().setOffline(false);
    await expect.poll(async () => norm(await cloudServerContent(id)), { timeout: 30_000 }).toBe(EXPECTED);
    expect(navs, "nothing navigated").toEqual([]);
  });
});
