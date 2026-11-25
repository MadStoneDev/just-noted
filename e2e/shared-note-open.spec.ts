import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/no-conflicts";
import { seededAccounts, seedState, signIn } from "./fixtures/auth";
import { adminClient } from "./fixtures/admin";

// Opening a shared note you can access:
//   - never shows "Can't access note" on the way in: a page load at its /n/
//     link (even with another note remembered as the last shared one, here
//     another account's on this device), and a reload at "/" that restores it;
//   - from a "Note shared with you" notification: the rail and sidebar switch
//     to Shared, the note opens and its row (and only its row) is highlighted.

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3050";

/** Records whether "Can't access note" is ever in the DOM, from the first paint. */
async function watchForAccessError(page: Page) {
  await page.addInitScript(() => {
    (window as any).__accessErrorSeen = false;
    const check = () => {
      if (document.body?.innerText?.includes("Can't access note")) (window as any).__accessErrorSeen = true;
    };
    new MutationObserver(check).observe(document, { childList: true, subtree: true, characterData: true });
  });
}
const accessErrorSeen = (page: Page) => page.evaluate(() => (window as any).__accessErrorSeen as boolean);

test.describe("shared note open", () => {
  test.skip(() => !seedState()?.sharedNote, "needs the seeded A→B share");

  test("no 'Can't access note' flash when B loads a note shared with them", async ({ page }) => {
    const [, b] = seededAccounts();
    const { shortcode } = seedState()!.sharedNote!;
    await signIn(page, b);
    await watchForAccessError(page);
    // Another account's last shared note is remembered on this device.
    await page.addInitScript((other) => {
      try {
        if (sessionStorage.getItem("__e2e_last_shared")) return;
        localStorage.setItem("justnoted_last_shared", JSON.stringify({ shortcode: "zzzzzzzz", account: other }));
        sessionStorage.setItem("__e2e_last_shared", "1");
      } catch {}
    }, seededAccounts()[0].id);

    await page.goto(`${BASE_URL}/n/${shortcode}`);
    const view = page.locator('main[aria-label="Shared note"]');
    await expect(view).toContainText("Shared with B for collaboration specs.");
    expect(await accessErrorSeen(page)).toBe(false);

    // Reload at "/": the app restores the last open shared note.
    await page.goto(`${BASE_URL}/`);
    await expect(view).toContainText("Shared with B for collaboration specs.");
    expect(await accessErrorSeen(page)).toBe(false);
  });

  test("a 'Note shared with you' notification opens the note under Shared, highlighted", async ({ page }) => {
    const [a, b] = seededAccounts();
    const { shortcode, noteId } = seedState()!.sharedNote!;
    const { data: notif, error } = await adminClient()
      .from("notifications")
      .insert({
        user_id: b.id,
        type: "shared_with_me",
        note_id: noteId,
        data: { actorName: a.handle, noteTitle: "E2E shared note", shortcode },
      })
      .select("id")
      .single();
    if (error) throw new Error(`notification seed: ${error.message}`);

    try {
      await signIn(page, b);
      // Start on the Notes rail with the shared note closed.
      await page.addInitScript(() => {
        try {
          if (sessionStorage.getItem("__e2e_rail_set")) return;
          localStorage.setItem("jn_sidebar_rail_view", "notes");
          localStorage.removeItem("justnoted_last_shared");
          sessionStorage.setItem("__e2e_rail_set", "1");
        } catch {}
      });
      await page.goto(`${BASE_URL}/`);
      await expect(page.locator('main[aria-label="Note editor"]')).toBeVisible();

      await page.getByRole("button", { name: /notifications/i }).first().click();
      await page.getByText("Note shared with you").first().click();

      await expect(page).toHaveURL(new RegExp(`/n/${shortcode}$`));
      await expect(page.locator('main[aria-label="Shared note"]')).toContainText("Shared with B for collaboration specs.");
      const active = page.locator('[data-shared-shortcode][data-active="true"]');
      await expect(active).toHaveCount(1);
      await expect(active).toHaveAttribute("data-shared-shortcode", shortcode);
      await expect(active).toBeVisible();
    } finally {
      await adminClient().from("notifications").delete().eq("id", notif.id);
    }
  });
});
