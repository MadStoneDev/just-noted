import type { Page } from "@playwright/test";
import Redis from "ioredis";
import { test, expect } from "./fixtures/no-conflicts";
import { seededAccounts, signIn } from "./fixtures/auth";
import { adminClient } from "./fixtures/admin";
import { e2eFileEnv } from "./fixtures/env";

// Ghost notes: a deleted note comes back.
//
// Seen in production (guest and signed-in): delete the open note → it leaves
// the sidebar and the "moved to Trash" toast shows, but the editor keeps
// showing it, and 1–2s later it's back in the sidebar. Cause: the server delete
// waited out the 10s undo window, and any refresh in that window put the
// server's still-live copy back; ✕ on the toast or a second delete cancelled
// the server delete outright. Fixed by deleting on the server at once and
// keeping unconfirmed deletes hidden (utils/pending-deletes).
//
// What must hold, for guest (Valkey) and cloud (Supabase) notes, whether the
// note is open (and was typed in <1s before the delete) or not:
//   - it leaves the sidebar AND the editor at once (the editor moves to another
//     note or the empty state);
//   - it never reappears in the 10s undo window, nor after it;
//   - the server ends with it deleted (Valkey field gone / deleted_at set);
//   - after a reload it's still gone, and no note holds its text (no
//     "(conflicted copy)" — checked by the fixture — and no "(recovered)").
// Plus: a reload while the delete hasn't reached the server keeps the note
// hidden and finishes the delete; Undo brings the note back exactly as it was
// on screen (text typed just before the delete included).

const EDITOR = ".ProseMirror";
const card = (page: Page, id: string) => page.locator(`[data-note-card="${id}"]`);

async function waitForApp(page: Page) {
  await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
}

async function activeCardId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.querySelector('[data-note-card][data-active="true"]')?.getAttribute("data-note-card") ?? null,
  );
}

/** Ctrl+J a new note, type `text`, and return its id. */
async function newNoteWith(page: Page, text: string): Promise<string> {
  const before = await activeCardId(page);
  await page.locator("body").press("Control+j");
  await expect.poll(() => activeCardId(page)).not.toBe(before);
  await expect(page.locator(EDITOR).first()).toBeVisible();
  const id = (await activeCardId(page))!;
  // Ctrl+J focuses the new note's editor; click in if it hasn't yet (a cold
  // dev server can be slow to hand focus over).
  if (!(await page.evaluate(() => !!document.activeElement?.closest(".ProseMirror")))) {
    await page.locator(EDITOR).first().click();
  }
  await page.keyboard.type(text);
  await expect(card(page, id)).toContainText(text);
  return id;
}

/** Delete via the sidebar card's trash button + the confirm dialog. */
async function deleteFromSidebar(page: Page, id: string) {
  await card(page, id).hover();
  await card(page, id).getByRole("button", { name: "Delete note" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
}

/** What the editor is showing: its note id (via the active card) and text. */
async function editorShows(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector(".ProseMirror")?.textContent ?? "");
}

/**
 * Sample the sidebar and editor every 200ms for `ms`, and record every moment
 * the deleted note (by id) or its text was visible. Returns a readable log.
 */
async function watchForGhost(page: Page, id: string, marker: string, ms: number) {
  const sightings: string[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const [inSidebar, shown] = await Promise.all([
      card(page, id).count().then((n) => n > 0),
      editorShows(page),
    ]);
    const inEditor = shown.includes(marker);
    if (inSidebar || inEditor) {
      sightings.push(`${Date.now() - t0}ms: ${[inSidebar && "sidebar", inEditor && "editor"].filter(Boolean).join("+")}`);
    }
    await page.waitForTimeout(200);
  }
  return sightings;
}

/** Log the note server actions made from `page` (op names, for the report). */
function logActions(page: Page, log: string[], t0: () => number) {
  page.on("request", (req) => {
    if (req.method() !== "POST" || !req.headers()["next-action"]) return;
    const body = req.postData() ?? "";
    const op = body.match(/"operation":"(\w+)"/)?.[1] ?? (body.trim() === "[]" ? "list" : `action ${body.slice(0, 60)}`);
    log.push(`${t0()}ms → ${op}`);
  });
}

// ── server state ────────────────────────────────────────────────────────────

const ANON_RE = /"userId":"([0-9a-fA-F-]{36})"/;
function captureAnonId(page: Page): { get: () => string | null } {
  let anon: string | null = null;
  page.on("request", (req) => {
    if (anon || req.method() !== "POST" || !req.headers()["next-action"]) return;
    anon = (req.postData() ?? "").match(ANON_RE)?.[1] ?? null;
  });
  return { get: () => anon };
}

async function guestNoteOnServer(anonId: string, noteId: string): Promise<boolean> {
  const url = e2eFileEnv().VALKEY_URL || process.env.VALKEY_URL || "redis://127.0.0.1:6380";
  const redis = new Redis(url, { keyPrefix: "justnoted:", lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    return (await redis.hexists(`notes:${anonId}`, noteId)) === 1;
  } finally {
    redis.disconnect();
  }
}

async function cloudRow(noteId: string): Promise<{ deleted_at: string | null } | null> {
  const { data } = await adminClient().from("notes").select("deleted_at").eq("id", noteId).maybeSingle();
  return (data as { deleted_at: string | null } | null) ?? null;
}

// ── shared scenarios ────────────────────────────────────────────────────────

type Mode = "guest" | "cloud";

async function liveOnServer(mode: Mode, anon: () => string | null, id: string): Promise<boolean> {
  if (mode === "guest") return guestNoteOnServer(anon()!, id);
  const row = await cloudRow(id);
  return !!row && !row.deleted_at;
}

/** After the delete: gone at once, stays gone 12s, server deleted, gone after reload. */
async function expectGoneForGood(
  page: Page,
  mode: Mode,
  anon: () => string | null,
  id: string,
  marker: string,
  log: string[],
) {
  // At once: out of the sidebar and out of the editor.
  await expect(card(page, id)).toHaveCount(0, { timeout: 1000 });
  await expect.poll(() => editorShows(page), { timeout: 1000 }).not.toContain(marker);

  // Never back, through the 10s undo window and past it.
  const sightings = await watchForGhost(page, id, marker, 12_000);
  const onServer = await liveOnServer(mode, anon, id);
  console.log(`[ghost ${mode}] actions:\n  ${log.join("\n  ")}\n  sightings: ${sightings.join(", ") || "none"}\n  live on server after 12s: ${onServer}`);
  expect(sightings, "deleted note reappeared (sidebar / editor)").toEqual([]);
  expect(onServer, "server still holds the note as live").toBe(false);

  // After a reload: still gone, and no note carries its text.
  await page.reload();
  await waitForApp(page);
  await page.waitForTimeout(3000); // let the load's reconcile + queue drain run
  await expect(card(page, id)).toHaveCount(0);
  await expect(page.locator("[data-note-card]").filter({ hasText: marker })).toHaveCount(0);
  expect(await liveOnServer(mode, anon, id)).toBe(false);
}

async function openTypedDelete(page: Page, mode: Mode) {
  const anon = captureAnonId(page);
  const log: string[] = [];
  const start = Date.now();
  logActions(page, log, () => Date.now() - start);

  // A note that's on the server, then a fresh line typed <1s before the delete.
  const marker = `ghost-open-${mode}-${Date.now()}`;
  const id = await newNoteWith(page, marker);
  await expect.poll(() => liveOnServer(mode, anon.get, id), { timeout: 15_000 }).toBe(true);
  await page.locator(EDITOR).first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" more");
  await page.waitForTimeout(400);
  log.push(`${Date.now() - start}ms ✂ delete (open note, typed 400ms ago)`);
  await deleteFromSidebar(page, id);

  await expectGoneForGood(page, mode, anon.get, id, marker, log);
}

async function notOpenDelete(page: Page, mode: Mode) {
  const anon = captureAnonId(page);
  const log: string[] = [];
  const start = Date.now();
  logActions(page, log, () => Date.now() - start);

  const marker = `ghost-closed-${mode}-${Date.now()}`;
  const id = await newNoteWith(page, marker);
  await expect.poll(() => liveOnServer(mode, anon.get, id), { timeout: 15_000 }).toBe(true);
  // Open another note, so the one we delete isn't in the editor.
  const other = await newNoteWith(page, `ghost-other-${Date.now()}`);
  await page.waitForTimeout(2500); // its autosave settles
  expect(await activeCardId(page)).toBe(other);
  log.push(`${Date.now() - start}ms ✂ delete (not open)`);
  await deleteFromSidebar(page, id);

  await expectGoneForGood(page, mode, anon.get, id, marker, log);
}

// The undo toast's timer is the server delete: anything that clears it before
// it fires leaves the note live on the server. Two ways to clear it today —
// deleting a second note within 10s (setRecentlyDeleted cancels the previous
// timer) and dismissing the toast (✕ → clearRecentlyDeleted).
async function deleteThenCancelTimer(page: Page, mode: Mode, how: "second-delete" | "dismiss") {
  const anon = captureAnonId(page);
  const log: string[] = [];
  const start = Date.now();
  logActions(page, log, () => Date.now() - start);

  const marker = `ghost-${how}-${mode}-${Date.now()}`;
  const id = await newNoteWith(page, marker);
  await expect.poll(() => liveOnServer(mode, anon.get, id), { timeout: 15_000 }).toBe(true);
  const second = await newNoteWith(page, `ghost-second-${Date.now()}`);
  await newNoteWith(page, `ghost-keep-${Date.now()}`); // stays open
  await page.waitForTimeout(2500);
  log.push(`${Date.now() - start}ms ✂ delete (not open)`);
  await deleteFromSidebar(page, id);
  await page.waitForTimeout(1000);
  if (how === "second-delete") {
    log.push(`${Date.now() - start}ms ✂ delete a second note`);
    await deleteFromSidebar(page, second);
  } else {
    log.push(`${Date.now() - start}ms ✕ dismiss the toast`);
    // A real click: the toast sits above the consent banner a fresh context
    // shows (it used to swallow clicks on Undo and ✕).
    await toast(page).getByRole("button", { name: "Dismiss" }).click();
  }

  await expectGoneForGood(page, mode, anon.get, id, marker, log);
}

const toast = (page: Page) => page.getByText("moved to Trash").locator("..");

// Reload while the delete hasn't reached the server: every server action that
// names the note fails until the reload (as a dropped connection would). The
// note must stay hidden through the reload, and the load must finish the delete.
async function reloadBeforeDeleteLands(page: Page, mode: Mode) {
  const anon = captureAnonId(page);
  const log: string[] = [];
  const start = Date.now();
  logActions(page, log, () => Date.now() - start);

  const marker = `ghost-reload-${mode}-${Date.now()}`;
  const id = await newNoteWith(page, marker);
  await expect.poll(() => liveOnServer(mode, anon.get, id), { timeout: 15_000 }).toBe(true);
  await newNoteWith(page, `ghost-keep-${Date.now()}`);
  await page.waitForTimeout(2500);

  const block = async (route: import("@playwright/test").Route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"] && (req.postData() ?? "").includes(id)) {
      log.push(`${Date.now() - start}ms ✗ blocked a server action naming the note`);
      return route.abort("connectionreset");
    }
    return route.fallback();
  };
  await page.route("**/*", block);
  log.push(`${Date.now() - start}ms ✂ delete (server unreachable for it)`);
  await deleteFromSidebar(page, id);
  await expect(card(page, id)).toHaveCount(0, { timeout: 1000 });
  await page.waitForTimeout(1500);
  expect(await liveOnServer(mode, anon.get, id), "the delete must not have landed yet").toBe(true);

  await page.unroute("**/*", block);
  log.push(`${Date.now() - start}ms ⟳ reload`);
  await page.reload();
  await waitForApp(page);
  // Hidden from the first paint on…
  const sightings = await watchForGhost(page, id, marker, 5000);
  // …and the load sent the delete again.
  await expect.poll(() => liveOnServer(mode, anon.get, id), { timeout: 20_000 }).toBe(false);
  console.log(`[ghost ${mode} reload] actions:\n  ${log.join("\n  ")}\n  sightings: ${sightings.join(", ") || "none"}`);
  expect(sightings, "deleted note showed after the reload").toEqual([]);

  await page.reload();
  await waitForApp(page);
  await page.waitForTimeout(3000);
  await expect(card(page, id)).toHaveCount(0);
  await expect(page.locator("[data-note-card]").filter({ hasText: marker })).toHaveCount(0);
}

// Undo right after deleting a note typed in <1s before: it comes back with
// that last text (never saved before the delete), live on the server, once.
async function undoRestoresLatestText(page: Page, mode: Mode) {
  const anon = captureAnonId(page);
  const marker = `ghost-undo-${mode}-${Date.now()}`;
  const id = await newNoteWith(page, marker);
  await expect.poll(() => liveOnServer(mode, anon.get, id), { timeout: 15_000 }).toBe(true);
  await page.locator(EDITOR).first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" undone");
  await page.waitForTimeout(400);
  await deleteFromSidebar(page, id);
  await expect(card(page, id)).toHaveCount(0, { timeout: 1000 });
  await page.waitForTimeout(1500); // the delete has landed on the server
  expect(await liveOnServer(mode, anon.get, id)).toBe(false);

  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(card(page, id)).toBeVisible();
  await expect(card(page, id)).toContainText(`${marker} undone`);
  await expect.poll(() => liveOnServer(mode, anon.get, id), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => serverContent(mode, anon.get, id), { timeout: 15_000 }).toContain(`${marker} undone`);

  // Stays back: through the old undo window, and after a reload — once.
  await page.waitForTimeout(11_000);
  await expect(card(page, id)).toBeVisible();
  await page.reload();
  await waitForApp(page);
  await page.waitForTimeout(3000);
  await expect(card(page, id)).toContainText(`${marker} undone`);
  await expect(page.locator("[data-note-card]").filter({ hasText: marker })).toHaveCount(1);
}

// Guest Undo that fails (offline: the note can't be re-created on the server,
// which already deleted it): the snapshot is kept in IndexedDB, the toast says
// "Couldn't restore. Try again." and stays. Hiding the toast and reloading
// don't lose it: the reload offers the retry again, and Try again (back online)
// restores the note with its text. Before, the failure refreshed the list and
// the note was lost.
async function failUndo(page: Page, prefix: string) {
  const anon = captureAnonId(page);
  const marker = `${prefix}-${Date.now()}`;
  const id = await newNoteWith(page, marker);
  await expect.poll(() => liveOnServer("guest", anon.get, id), { timeout: 15_000 }).toBe(true);
  await deleteFromSidebar(page, id);
  await expect(card(page, id)).toHaveCount(0, { timeout: 1000 });
  await expect.poll(() => liveOnServer("guest", anon.get, id), { timeout: 15_000 }).toBe(false);

  await page.context().setOffline(true);
  await toast(page).getByRole("button", { name: "Undo" }).click();
  const failed = page.getByRole("alert").filter({ hasText: "Couldn't restore. Try again." });
  await expect(failed).toBeVisible();
  await expect(card(page, id)).toHaveCount(0);
  return { anon, marker, id, failed };
}

async function failedUndoKeepsGuestNote(page: Page) {
  const { anon, marker, id, failed } = await failUndo(page, "ghost-undo-fail");
  // It stays: no 10s countdown on a failed restore.
  await page.waitForTimeout(11_000);
  await expect(failed).toBeVisible();

  // Hiding the toast keeps the note; a reload offers the retry again.
  await failed.getByRole("button", { name: /Hide/ }).click();
  await expect(failed).toHaveCount(0);
  await page.context().setOffline(false);
  await page.reload();
  await waitForApp(page);
  await expect(failed).toBeVisible();
  await expect(card(page, id)).toHaveCount(0);

  await failed.getByRole("button", { name: "Try again" }).click();
  await expect(card(page, id)).toBeVisible();
  await expect(card(page, id)).toContainText(marker);
  await expect.poll(() => serverContent("guest", anon.get, id), { timeout: 15_000 }).toContain(marker);
  await expect(page.getByText("Couldn't restore. Try again.")).toHaveCount(0);
  // Restored: nothing kept any more, so a reload doesn't offer it again.
  await page.reload();
  await waitForApp(page);
  await expect(card(page, id)).toContainText(marker);
  await page.waitForTimeout(1500);
  await expect(page.getByText("Couldn't restore. Try again.")).toHaveCount(0);
}

// Discard is the explicit way to give the kept snapshot up: gone after a reload.
async function failedUndoDiscard(page: Page) {
  const { id, failed } = await failUndo(page, "ghost-undo-discard");
  await page.context().setOffline(false);
  await failed.getByRole("button", { name: "Discard" }).click();
  await expect(failed).toHaveCount(0);
  await page.reload();
  await waitForApp(page);
  await page.waitForTimeout(1500);
  await expect(page.getByText("Couldn't restore. Try again.")).toHaveCount(0);
  await expect(card(page, id)).toHaveCount(0);
}

async function serverContent(mode: Mode, anon: () => string | null, id: string): Promise<string> {
  if (mode === "guest") {
    const url = e2eFileEnv().VALKEY_URL || process.env.VALKEY_URL || "redis://127.0.0.1:6380";
    const redis = new Redis(url, { keyPrefix: "justnoted:", lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      const raw = await redis.hget(`notes:${anon()!}`, id);
      return raw ? String(JSON.parse(raw).content ?? "") : "";
    } finally {
      redis.disconnect();
    }
  }
  const { data } = await adminClient().from("notes").select("content").eq("id", id).maybeSingle();
  return String((data as { content?: string } | null)?.content ?? "");
}

// ── specs ───────────────────────────────────────────────────────────────────

test.describe("delete never comes back — guest (Valkey)", () => {
  test("open note, typed, deleted within 1s", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await waitForApp(page);
    await openTypedDelete(page, "guest");
  });

  test("note that isn't open", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await waitForApp(page);
    await notOpenDelete(page, "guest");
  });

  test("deleting a second note within 10s doesn't cancel the first delete", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await waitForApp(page);
    await deleteThenCancelTimer(page, "guest", "second-delete");
  });

  test("dismissing the undo toast doesn't cancel the delete", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await waitForApp(page);
    await deleteThenCancelTimer(page, "guest", "dismiss");
  });

  test("reload before the delete reaches the server", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await waitForApp(page);
    await reloadBeforeDeleteLands(page, "guest");
  });

  test("undo brings the note back with its last-typed text", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await waitForApp(page);
    await undoRestoresLatestText(page, "guest");
  });

  test("an undo that fails keeps the note and offers Try again", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await waitForApp(page);
    await failedUndoKeepsGuestNote(page);
  });

  test("a failed undo's note is dropped only by Discard", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await waitForApp(page);
    await failedUndoDiscard(page);
  });
});

test.describe("delete never comes back — cloud (Supabase)", () => {
  // The seeded accounts are shared: one test at a time.
  test.describe.configure({ mode: "serial" });
  test.skip(seededAccounts().length < 1, "needs seeded accounts (service-role key in .env.e2e)");
  test("open note, typed, deleted within 1s", async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, seededAccounts()[0]);
    await page.goto("/");
    await waitForApp(page);
    await openTypedDelete(page, "cloud");
  });

  test("note that isn't open", async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, seededAccounts()[0]);
    await page.goto("/");
    await waitForApp(page);
    await notOpenDelete(page, "cloud");
  });

  test("reload before the delete reaches the server", async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, seededAccounts()[0]);
    await page.goto("/");
    await waitForApp(page);
    await reloadBeforeDeleteLands(page, "cloud");
  });

  test("undo brings the note back with its last-typed text", async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, seededAccounts()[0]);
    await page.goto("/");
    await waitForApp(page);
    await undoRestoresLatestText(page, "cloud");
  });
});
