import { test, expect, type Page } from "@playwright/test";
import { seededAccounts, signIn } from "./fixtures/auth";

// Core flows for the Ready-for-mobile gate (docs/mobile-readiness.md).
//
// Status:
// - Local (anonymous) flows below are implemented against code-derived selectors
//   (Ctrl+J = new note; Milkdown renders `.ProseMirror`; sidebar rows carry
//   `data-note-id`). They need a local run with runtime env to confirm — even
//   "local" notes are Redis-backed server-side today.
// - Cloud and B7 flows have real bodies but SKIP unless E2E_ACCOUNTS provides
//   seeded sessions (see fixtures/auth.ts); the session-injection helper must be
//   finalised against the running app before they go green.
// - The remaining flows stay `test.fixme` until their selectors are verified.

const EDITOR = ".ProseMirror"; // Milkdown's ProseMirror surface (contenteditable)
const NOTE_ROW = "[data-note-id]";

async function newNote(page: Page): Promise<void> {
  // Ctrl/Cmd+J is a global shortcut that works even while typing.
  await page.keyboard.press("Control+j");
}

async function editorText(page: Page) {
  return page.locator(EDITOR).first();
}

test.describe("notes — local (Redis, anonymous)", () => {
  test("create, edit, reload → content persists", async ({ page }) => {
    await page.goto("/");
    const editor = await editorText(page);
    await expect(editor).toBeVisible();

    await newNote(page);
    const marker = `e2e-local-${Date.now()}`;
    await editor.click();
    await page.keyboard.type(marker);
    await expect(editor).toContainText(marker);

    // Allow immediate local persistence (~0.5s) + autosave to settle before reload.
    await page.waitForTimeout(1500);
    await page.reload();

    await expect((await editorText(page))).toContainText(marker);
  });

  test("new note appears in the sidebar immediately (B8/D13)", async ({ page }) => {
    await page.goto("/");
    await expect(await editorText(page)).toBeVisible();

    const before = await page.locator(NOTE_ROW).count();
    await newNote(page);
    // The row must show up without selecting another note first.
    await expect(page.locator(NOTE_ROW)).toHaveCount(before + 1);
  });
});

test.describe("notes — cloud (Supabase, signed-in)", () => {
  test.skip(seededAccounts().length < 1, "needs E2E_ACCOUNTS (see fixtures/auth.ts)");

  test("create, edit, reload → content persists for the account", async ({ page }) => {
    const [acc] = seededAccounts();
    await signIn(page, acc);
    await page.goto("/");

    const editor = await editorText(page);
    await expect(editor).toBeVisible();
    await newNote(page);
    const marker = `e2e-cloud-${Date.now()}`;
    await editor.click();
    await page.keyboard.type(marker);
    await expect(editor).toContainText(marker);

    await page.waitForTimeout(2500); // cloud autosave (2s debounce) + round-trip
    await page.reload();
    await expect(await editorText(page)).toContainText(marker);
  });

  test.fixme("move a note local ↔ cloud", async () => {
    // TODO: transfer a local note to the account and back; assert source + survival.
  });
});

test.describe("account switching (B7)", () => {
  test.skip(seededAccounts().length < 2, "needs 2 seeded accounts in E2E_ACCOUNTS");

  test("keeps the Switching… screen up until the new account loads", async ({ page }) => {
    const [a, b] = seededAccounts();
    await signIn(page, a);
    await page.goto("/");
    await expect(await editorText(page)).toBeVisible();

    await switchAccountViaUi(page, b.label);
    // The hand-off overlay is shown until the new account's notes sync.
    await expect(page.getByText(/Switching to/i)).toBeVisible();
    await expect(page.getByText(/Switching to/i)).toBeHidden({ timeout: 15_000 });
    // After the gate clears, the app shell is interactive again.
    await expect(await editorText(page)).toBeVisible();
  });

  test("never writes the previous account's note under the new session", async ({ page, context }) => {
    const [a, b] = seededAccounts();
    await signIn(page, a);
    await page.goto("/");
    const editor = await editorText(page);
    await expect(editor).toBeVisible();

    // Queue an edit for account A while offline so it can't flush before the switch.
    await context.setOffline(true);
    await newNote(page);
    const marker = `e2e-b7-${Date.now()}`;
    await editor.click();
    await page.keyboard.type(marker);
    await page.waitForTimeout(800); // let it enqueue to IDB

    // Switch to B and come back online. A's queued op must NOT land under B.
    await switchAccountViaUi(page, b.label);
    await context.setOffline(false);
    await page.waitForTimeout(3000);

    // B must not have A's note. (The unit guarantee lives in
    // src/utils/offline-queue-guard.test.ts and the integration test.)
    await expect(page.getByText(marker)).toHaveCount(0);
  });
});

// TODO: implement a UI driver for the account switcher (open AccountMenu, click
// the target, confirm the modal if shown). Kept here so both B7 specs share it.
async function switchAccountViaUi(page: Page, _targetLabel: string): Promise<void> {
  await page.locator('button[aria-label="Account"]').click();
  // TODO: click the target account row + confirm the AccountSwitchModal.
  throw new Error("switchAccountViaUi not implemented — finalise against the running app");
}

test.describe("sharing & collaboration", () => {
  test.fixme("share with edit access + two-context live editing without reload", async () => {});
  test.fixme("trash / restore and shared-note access gate", async () => {});
});

test.describe("account lifecycle", () => {
  test.fixme("account data export", async () => {});
  test.fixme("delete / restore account", async () => {});
});

test.describe("October features (no browser coverage yet)", () => {
  test.fixme("recipient pin/hide/sort/tags/drag-reorder", async () => {});
  test.fixme("unified shared NoteView + split view", async () => {});
  test.fixme("chat drawer open/close + send", async () => {});
  test.fixme("tags on standard notes", async () => {});
});
