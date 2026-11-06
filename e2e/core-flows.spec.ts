import { test, expect } from "@playwright/test";

// Core flows for the Ready-for-mobile gate (docs/mobile-readiness.md).
//
// These are scaffolded as `test.fixme` because their selectors must be verified
// against a running app (several surfaces — e.g. the Milkdown editor — have no
// stable role/testid yet). Unskip them one at a time: confirm/add the selector
// (prefer a role; add a `data-testid` to the product component if there is no good
// one), then remove `.fixme`. Keep each test independent and self-cleaning.

test.describe("notes — local (Redis, anonymous)", () => {
  test.fixme("create, edit, reload → content persists", async ({ page }) => {
    await page.goto("/");
    // TODO: trigger "New note" (Ctrl+J, or the FAB `[aria-label="New note"]`).
    // TODO: type into the editor surface (add data-testid="note-editor-surface").
    // TODO: reload; assert the typed content is still present.
  });

  test.fixme("new note appears in the sidebar immediately (B8/D13)", async ({ page }) => {
    await page.goto("/");
    // TODO: create a note; assert a sidebar row with its data-note-id shows up
    // WITHOUT needing to select another note first.
  });
});

test.describe("notes — cloud (Supabase, signed-in)", () => {
  test.fixme("create, edit, reload → content persists for the account", async () => {
    // TODO: sign in with the seeded E2E account; repeat the local flow and assert
    // the note survives a reload and is scoped to the account.
  });

  test.fixme("move a note local ↔ cloud", async () => {
    // TODO: transfer a local note to the account and back; assert source + survival.
  });
});

test.describe("navigation & editor", () => {
  test.fixme("keyboard note switching focuses the editor (E1)", async () => {
    // TODO: Ctrl+Alt+↑/↓ switches notes and focuses the editor caret-at-end,
    // and does NOT count as an edit (open-never-edits).
  });

  test.fixme("rail navigation closes open overlays (B6)", async () => {
    // TODO: open Settings/Trash/notebook view, click a rail item, assert overlay closes.
  });
});

test.describe("account switching (B7)", () => {
  test.fixme("keeps the Switching… screen up until the new account loads", async () => {
    // TODO: with two seeded accounts, switch; assert the transition overlay stays
    // until the new account's notes are present, then clears.
  });

  test.fixme("never writes the previous account's note under the new session", async () => {
    // TODO: queue an edit for account A while offline, switch to B, go online;
    // assert A's note is unchanged under B and the op did not land on B.
    // (Unit-level guarantee is covered by src/utils/offline-queue-guard.test.ts.)
  });
});

test.describe("sharing & collaboration", () => {
  test.fixme("share with edit access + two-context live editing without reload", async ({ browser }) => {
    // TODO: two browser contexts editing the same shared note; assert live merge.
  });

  test.fixme("trash / restore and shared-note access gate", async () => {
    // TODO: trashing a shared note blocks recipient access; restore re-enables.
  });
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

// Keep the file importing `expect` so unskipping a test needs no extra edits.
void expect;
