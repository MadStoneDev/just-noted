import { test, expect, type Page } from "@playwright/test";
import { seededAccounts, signIn } from "./fixtures/auth";

// Core flows for the Ready-for-mobile gate (docs/mobile-readiness.md).
//
// Status:
// - Local (anonymous) flows are implemented. A clean context opens the notes app
//   with NO note open, so the editor (`.ProseMirror`) mounts only after a note is
//   created. Even "local" notes are Redis-backed server-side, so these need
//   runtime env to pass.
// - Cloud and B7 flows have real bodies but SKIP unless E2E_ACCOUNTS supplies
//   seeded sessions (see fixtures/auth.ts); the session-injection helper and the
//   account-switcher UI driver must be finalised against the running app.
// - The remaining flows stay `test.fixme` until their selectors are verified.

const EDITOR = ".ProseMirror"; // Milkdown's ProseMirror surface (contenteditable)
const NOTE_ROW = "[data-note-card]"; // one sidebar note card (carries the note id)

// The sidebar's note-count footer ("0 notes" / "1 note"), a reliable, visible
// signal for whether a note is in the list.
const noteCount = (page: Page) => page.getByText(/^\d+ notes?$/);

// Parse the numeric note count out of the footer ("3 notes" → 3). Returns 0 when
// the footer isn't present yet.
async function readNoteCount(page: Page): Promise<number> {
  try {
    const t = await noteCount(page).first().innerText({ timeout: 5000 });
    return parseInt(t.match(/\d+/)?.[0] ?? "0", 10);
  } catch {
    return 0;
  }
}

// Wait for the notes app shell to be ready (so actions have a mounted target).
async function waitForApp(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
}

// Create the first note. On a clean load the main editor region shows an empty
// state with its own "New note" button — unambiguous (the rail's icon button has
// the same name), and clicking it mounts the editor.
async function createFirstNote(page: Page): Promise<void> {
  await page
    .getByRole("main", { name: "Note editor" })
    .getByRole("button", { name: "New note" })
    .click();
  await expect(page.locator(EDITOR).first()).toBeVisible();
}

function editor(page: Page) {
  return page.locator(EDITOR).first();
}

test.describe("notes — local (Redis, anonymous)", () => {
  test("create, edit, reload → content persists", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);

    await createFirstNote(page);
    const marker = `e2e-local-${Date.now()}`;
    await editor(page).click();
    await page.keyboard.type(marker);
    await expect(editor(page)).toContainText(marker);

    // Let the content autosave persist (debounce + round-trip) before reloading.
    await page.waitForTimeout(3000);
    await page.reload();
    await waitForApp(page);

    // The most-recent note is auto-opened after reload; assert its content survived.
    await expect(editor(page)).toContainText(marker, { timeout: 20_000 });
  });

  // Acceptance test for B8 (a new note must appear in the sidebar immediately,
  // without selecting another note first). D13 is the related keystroke-lag
  // symptom, fixed by id-scoped/shallow store selectors + memoised list rows
  // (NoteCard). NOTE: the originally-reported B8 bug was observed SIGNED IN
  // (cloud notes); this anonymous/local case did not reproduce it on its own.
  // The signed-in variant lives in the cloud describe block below and is the
  // one that exercises the reported path (runs once E2E_ACCOUNTS is set).
  test("new note appears in the sidebar immediately (B8) — local", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await expect(noteCount(page)).toHaveText("0 notes");
    await createFirstNote(page);
    await expect(noteCount(page)).toHaveText("1 note");
  });

  // E1 acceptance: keyboard note switching lands in the target note's editor with
  // the caret at the end, ready to type — and opening it is NOT an edit (no
  // "Saving…", per "open never edits"). The target ends in a list on purpose:
  // that's the shape where Milkdown's trailing-paragraph plugin could turn a
  // caret placement into a doc change.
  test("keyboard switch focuses the editor at the end, without an edit (E1)", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);

    // Note A — ends in a bullet list.
    await createFirstNote(page);
    const aId = await activeCardId(page);
    await page.keyboard.type("- alpha item");
    await expect(page.locator(`[data-note-card="${aId}"]`)).toContainText("alpha item");

    // Note B — plain paragraph; focus ends up in B's editor.
    await page.keyboard.press("Control+j");
    await expect(noteCount(page)).toHaveText("2 notes");
    const bId = await activeCardId(page);
    await page.keyboard.type("bravo paragraph");
    await expect(page.locator(`[data-note-card="${bId}"]`)).toContainText("bravo paragraph");
    await page.waitForTimeout(2500); // let B's cloud debounce settle first

    // Watch the editor's status for any "Saving…" from here on.
    await page.evaluate(() => {
      (window as any).__sawSaving = false;
      new MutationObserver(() => {
        if (/Saving/.test(document.getElementById("main-content")?.textContent ?? "")) {
          (window as any).__sawSaving = true;
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });

    // Jump to A by its sidebar position (Ctrl+Alt+N).
    const ids = await page.locator(NOTE_ROW).evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-note-card")),
    );
    await page.keyboard.press(`Control+Alt+${ids.indexOf(aId) + 1}`);
    await expect(editor(page)).toContainText("alpha item");
    expect(await activeCardId(page)).toBe(aId);

    // Focus is in the editor body…
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest(".ProseMirror")))
      .toBe(true);
    // …and opening it was not an edit.
    await page.waitForTimeout(2500);
    expect(await page.evaluate(() => (window as any).__sawSaving)).toBe(false);

    // Caret at the end: typing appends to the last list item straight away.
    await page.keyboard.type(" end");
    await expect(editor(page).locator("li").last()).toHaveText("alpha item end");
  });

  // Data-loss regression: the editor debounces change emission (~300ms across
  // Milkdown's listener + LazyTextBlock). Leaving a note inside that window —
  // here Ctrl+J straight after typing — used to drop the last keystrokes (a
  // freshly-typed note came back "Empty note"). The unmount path now flushes.
  test("text typed just before leaving a note is kept (fast Ctrl+J)", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await createFirstNote(page);
    const aId = await activeCardId(page);
    await page.keyboard.type("quick words");
    await page.keyboard.press("Control+j"); // no wait — inside the debounce window
    await expect(noteCount(page)).toHaveText("2 notes");
    await expect(page.locator(`[data-note-card="${aId}"]`)).toContainText("quick words");

    await page.waitForTimeout(3000); // let the save land
    await page.reload();
    await waitForApp(page);
    await expect(page.locator(`[data-note-card="${aId}"]`)).toContainText("quick words", {
      timeout: 20_000,
    });
  });

  // Regression: a background refresh used to filter empty "New Note #N" notes
  // out of the store, so a just-created note vanished (and its editor closed)
  // when the poll landed. It must survive the 12s visible-tab refresh.
  test("an empty new note survives a background refresh", async ({ page }) => {
    test.slow();
    await page.goto("/");
    await waitForApp(page);
    await createFirstNote(page);
    const id = await activeCardId(page);
    await page.waitForTimeout(15_000); // > VISIBLE_REFRESH_INTERVAL (12s)
    await expect(noteCount(page)).toHaveText("1 note");
    expect(await activeCardId(page)).toBe(id);
    await expect(editor(page)).toBeVisible();
  });

  // E1: the shortcut must not steal focus from an open overlay (search modal).
  test("keyboard switch stands aside while search is open (E1)", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await createFirstNote(page);
    await page.keyboard.type("one");
    await page.keyboard.press("Control+j");
    await expect(noteCount(page)).toHaveText("2 notes");
    const before = await activeCardId(page);

    await page.keyboard.press("Control+k");
    const search = page.getByRole("dialog", { name: "Search notes" });
    await expect(search).toBeVisible();
    const input = search.locator("input").first();
    await expect(input).toBeFocused();

    await page.keyboard.press("Control+Alt+ArrowDown");
    await page.keyboard.press("Control+Alt+2");
    await expect(search).toBeVisible();
    await expect(input).toBeFocused();
    expect(await activeCardId(page)).toBe(before);
  });
});

// The id of the sidebar card for the open note (marked data-active="true").
async function activeCardId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-note-card][data-active="true"]');
    return el?.getAttribute("data-note-card") ?? null;
  });
}

test.describe("notes — cloud (Supabase, signed-in)", () => {
  test.skip(seededAccounts().length < 1, "needs E2E_ACCOUNTS (see fixtures/auth.ts)");

  test("create, edit, reload → content persists for the account", async ({ page }) => {
    const [acc] = seededAccounts();
    await signIn(page, acc);
    await page.goto("/");
    await waitForApp(page);

    await createFirstNote(page);
    const marker = `e2e-cloud-${Date.now()}`;
    await editor(page).click();
    await page.keyboard.type(marker);
    await expect(editor(page)).toContainText(marker);

    await page.waitForTimeout(2500); // cloud autosave (2s debounce) + round-trip
    await page.reload();
    await waitForApp(page);
    await page.locator(NOTE_ROW).first().click();
    await expect(editor(page)).toContainText(marker);
  });

  // Acceptance test for B8 on the SIGNED-IN path — the one the bug was actually
  // reported on (cloud notes). A signed-in account may already hold notes, so
  // assert the footer count increments by exactly one the moment the note is
  // created, with NO reload and WITHOUT selecting another note first.
  test("new note appears in the sidebar immediately (B8) — cloud", async ({ page }) => {
    const [acc] = seededAccounts();
    await signIn(page, acc);
    await page.goto("/");
    await waitForApp(page);

    const before = await readNoteCount(page);
    // Ctrl/Cmd+J creates a note regardless of whether one is already open (the
    // empty-state button only exists when nothing is open).
    await page.keyboard.press("Control+j");
    await expect(noteCount(page)).toHaveText(
      new RegExp(`^${before + 1} notes?$`),
    );
    // The new row is in the list immediately (not only after selecting another).
    await expect(page.locator(NOTE_ROW)).toHaveCount(before + 1);
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
    await waitForApp(page);

    await switchAccountViaUi(page, b.label);
    await expect(page.getByText(/Switching to/i)).toBeVisible();
    await expect(page.getByText(/Switching to/i)).toBeHidden({ timeout: 15_000 });
    await waitForApp(page);
  });

  test("never writes the previous account's note under the new session", async ({ page, context }) => {
    const [a, b] = seededAccounts();
    await signIn(page, a);
    await page.goto("/");
    await waitForApp(page);

    // Queue an edit for account A while offline so it can't flush before the switch.
    await context.setOffline(true);
    await createFirstNote(page);
    const marker = `e2e-b7-${Date.now()}`;
    await editor(page).click();
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
