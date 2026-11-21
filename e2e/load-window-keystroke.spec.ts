import type { Page } from "@playwright/test";
import Redis from "ioredis";
import { test, expect } from "./fixtures/no-conflicts";
import { seededAccounts, signIn } from "./fixtures/auth";
import { adminClient } from "./fixtures/admin";

// Keystrokes right after a note opens (docs/tickets/done/saving-stuck-after-load-window-keystroke.md).
//
// When a note with stored text opens, Milkdown may re-serialise it and emit
// that through onChange. That emission is not an edit and must not save. The
// editor used to recognise it as "the first emission within 1s of mount", so
// a real keystroke in that second was taken as the load re-serialisation:
//   (a) a single keystroke there was adopted as the saved baseline and never
//       persisted (not to IndexedDB, not to the server), so a reload dropped it;
//   (b) the editor and useAutoSave then disagreed about what was saved, so an
//       edit back to the stored text left the status on "Saving…" for good.
// (c) is the same "back to the stored text" edit made outside the load window,
//     before the 2s autosave fires. It must settle too, and the reverted text
//     must not come back from the IndexedDB write-ahead copy on reload.
// (d) a toolbar button (no key or input event on the editor) clicked in the
//     first second is an edit too and must survive a reload.
// (e) an edit whose save FAILED, then deleted back to the saved text: its
//     offline-queue entry is dropped, so restoring the network can't push the
//     deleted text, and no conflicted copy appears.
// (f) text written offline (cached unsynced), the page reloaded still offline,
//     then a character typed and deleted: the opened text is still unsynced
//     (IndexedDB localEdit mark, queue entries kept), so once the network is
//     back it reaches the server, with no conflicted copy.

const MAIN = 'main[aria-label="Note editor"]';
const EDITOR = `${MAIN} .ProseMirror`;
const LOAD_WINDOW_MS = 1000; // LOAD_EMISSION_WINDOW_MS in src/utils/editor-save-decision.ts

const norm = (s: string | null | undefined) => (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const activeId = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-note-card][data-active="true"]')?.getAttribute("data-note-card") ?? null);
const editorFocused = (page: Page) => page.evaluate(() => !!document.activeElement?.closest(".ProseMirror"));
const saveStatus = (page: Page) => page.locator(`${MAIN} [data-testid="save-status"]`);

async function idbContent(page: Page, noteId: string): Promise<string | null> {
  return page.evaluate(
    (id) =>
      new Promise<string | null>((resolve) => {
        const req = indexedDB.open("NotesCacheDB");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction("notes", "readonly").objectStore("notes").get(id);
          get.onsuccess = () => { resolve(get.result?.content ?? null); db.close(); };
          get.onerror = () => { resolve(null); db.close(); };
        };
      }),
    noteId,
  );
}

/** The cached copy's localEdit mark (unsynced text), or null when there is no copy. */
async function idbLocalEdit(page: Page, noteId: string): Promise<number | false | null> {
  return page.evaluate(
    (id) =>
      new Promise<number | false | null>((resolve) => {
        const req = indexedDB.open("NotesCacheDB");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction("notes", "readonly").objectStore("notes").get(id);
          get.onsuccess = () => { resolve(get.result ? (get.result.localEdit ?? false) : null); db.close(); };
          get.onerror = () => { resolve(null); db.close(); };
        };
      }),
    noteId,
  );
}

/** This note's content updates waiting in the offline queue. */
async function queuedUpdates(page: Page, noteId: string): Promise<string[]> {
  return page.evaluate(
    (id) =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open("OfflineQueueDB");
        req.onerror = () => resolve([]);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("operations")) { db.close(); resolve([]); return; }
          const all = db.transaction("operations", "readonly").objectStore("operations").getAll();
          all.onsuccess = () => {
            resolve(
              (all.result as { payload: { type: string; noteId: string; content?: string } }[])
                .filter((o) => o.payload.noteId === id && o.payload.type === "update")
                .map((o) => o.payload.content ?? ""),
            );
            db.close();
          };
          all.onerror = () => { resolve([]); db.close(); };
        };
      }),
    noteId,
  );
}

/** Make every server action fail at the network until the returned undo runs. */
async function failServerActions(page: Page): Promise<() => Promise<void>> {
  const handler = async (route: import("@playwright/test").Route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) return route.abort("internetdisconnected");
    return route.continue();
  };
  await page.route("**/*", handler);
  return () => page.unroute("**/*", handler);
}

/**
 * Offline as far as the app's data goes, while the page itself still loads (so
 * it can be reloaded): server actions, the app's /api routes and every other
 * origin (Supabase REST / auth / storage) fail at the network until the
 * returned undo runs. The tab-close keepalive save (fetch on pagehide) isn't
 * seen by request routing, so the page's own fetch refuses /api calls too,
 * across reloads, while the sessionStorage flag is set.
 */
const OFFLINE_FLAG = "__e2eOffline";
async function goOffline(page: Page): Promise<() => Promise<void>> {
  const appOrigin = new URL(page.url()).origin;
  const handler = async (route: import("@playwright/test").Route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) return route.abort("internetdisconnected");
    const url = new URL(req.url());
    if (url.origin !== appOrigin || url.pathname.startsWith("/api/")) return route.abort("internetdisconnected");
    return route.continue();
  };
  const patchFetch = (flag: string) => {
    const w = window as unknown as { __e2eFetchPatched?: boolean };
    if (w.__e2eFetchPatched) return;
    w.__e2eFetchPatched = true;
    const real = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (sessionStorage.getItem(flag) === "1" && new URL(href, location.href).pathname.startsWith("/api/")) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return real(input, init);
    };
  };
  await page.addInitScript(patchFetch, OFFLINE_FLAG);
  await page.evaluate(patchFetch, OFFLINE_FLAG);
  await page.evaluate((flag) => sessionStorage.setItem(flag, "1"), OFFLINE_FLAG);
  await page.context().route("**/*", handler);
  return async () => {
    await page.context().unroute("**/*", handler);
    await page.evaluate((flag) => sessionStorage.removeItem(flag), OFFLINE_FLAG);
  };
}

/** Timestamps (performance.now) of each editor mount and of each key pressed in it. */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__lw = { mounts: [] as number[], keys: [] as { key: string; t: number }[] };
    const seen = new WeakSet<Element>();
    new MutationObserver(() => {
      document.querySelectorAll(".ProseMirror").forEach((el) => {
        if (!seen.has(el)) { seen.add(el); w.__lw.mounts.push(performance.now()); }
      });
    }).observe(document, { childList: true, subtree: true });
    document.addEventListener("keydown", (e) => {
      if ((e.target as Element | null)?.closest?.(".ProseMirror")) w.__lw.keys.push({ key: e.key, t: performance.now() });
    }, true);
    // Toolbar clicks, logged under the button's aria-label.
    document.addEventListener("click", (e) => {
      const b = (e.target as Element | null)?.closest?.("button[aria-label]");
      if (b) w.__lw.keys.push({ key: `button:${b.getAttribute("aria-label")}`, t: performance.now() });
    }, true);
  });
}

interface Mode {
  /** Open the app and create a note, with the editor focused. */
  createNote: (page: Page) => Promise<string>;
  serverContent: (noteId: string) => Promise<string | null>;
  savedLabel: string;
}

const STORED = "stored text for the load window";

/**
 * Create note A holding STORED (saved), then a second note so A is closed.
 * Returns A's id.
 */
async function seedStoredNote(page: Page, mode: Mode): Promise<string> {
  const id = await mode.createNote(page);
  await page.keyboard.type(STORED, { delay: 20 });
  await expect.poll(async () => norm(await mode.serverContent(id)), { timeout: 15_000 }).toBe(STORED);
  await expect(saveStatus(page)).toHaveText(mode.savedLabel, { timeout: 15_000 });
  await page.waitForTimeout(800);
  await page.locator("body").press("Control+j"); // another note, so A closes
  await expect.poll(() => activeId(page)).not.toBe(id);
  await page.waitForTimeout(1000);
  return id;
}

/**
 * Open note A and type `key` at its end as soon as the editor is there.
 * Returns how long after the editor mounted the key landed.
 */
async function openAndTypeAtOnce(page: Page, noteId: string, key: string): Promise<number> {
  const mountsBefore = await page.evaluate(() => (window as any).__lw.mounts.length);
  await page.locator(`[data-note-card="${noteId}"]`).click();
  const ed = page.locator(EDITOR);
  await expect(ed).toContainText(STORED);
  await ed.click();
  await page.keyboard.press("End");
  await page.keyboard.type(key);
  return page.evaluate(({ before, key }) => {
    const lw = (window as any).__lw;
    const mount = lw.mounts[lw.mounts.length - 1];
    const press = [...lw.keys].reverse().find((k: { key: string }) => k.key === key);
    return lw.mounts.length > before && press ? press.t - mount : Number.POSITIVE_INFINITY;
  }, { before: mountsBefore, key });
}

async function reopen(page: Page, noteId: string) {
  await page.reload();
  await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
  await page.locator(`[data-note-card="${noteId}"]`).click();
  await expect(page.locator(EDITOR)).toContainText(STORED, { timeout: 20_000 });
  await page.waitForTimeout(3000); // startup reconcile + any push it makes
}

function cases(mode: () => Mode) {
  test("(a) one keystroke in the first second survives a reload", async ({ page }) => {
    test.setTimeout(90_000);
    const m = mode();
    await instrument(page);
    const id = await seedStoredNote(page, m);
    const ms = await openAndTypeAtOnce(page, id, "Q");
    console.log(`[load-window] (a) key landed ${Math.round(ms)}ms after the editor mounted`);
    test.skip(ms >= LOAD_WINDOW_MS, `key landed ${Math.round(ms)}ms after mount — load window not exercised`);
    const expected = `${STORED}Q`;

    await page.waitForTimeout(4000); // autosave debounce (2s) + round trip
    const before = { idb: norm(await idbContent(page, id)), server: norm(await m.serverContent(id)) };
    console.log(`[load-window] (a) before reload: ${JSON.stringify(before)}`);
    expect.soft(before.idb, "IndexedDB before reload").toBe(expected);
    expect.soft(before.server, "server before reload").toBe(expected);
    await expect.soft(saveStatus(page)).toHaveText(m.savedLabel);

    await reopen(page, id);
    expect(norm(await page.locator(EDITOR).innerText()), "editor after reload").toBe(expected);
    expect(norm(await idbContent(page, id)), "IndexedDB after reload").toBe(expected);
    expect(norm(await m.serverContent(id)), "server after reload").toBe(expected);
  });

  test("(b) keystroke in the first second, then back to the stored text: status settles", async ({ page }) => {
    test.setTimeout(90_000);
    const m = mode();
    await instrument(page);
    const id = await seedStoredNote(page, m);
    const ms = await openAndTypeAtOnce(page, id, "Q");
    console.log(`[load-window] (b) key landed ${Math.round(ms)}ms after the editor mounted`);
    test.skip(ms >= LOAD_WINDOW_MS, `key landed ${Math.round(ms)}ms after mount — load window not exercised`);

    await page.waitForTimeout(1200); // past the load window, inside the 2s autosave debounce
    await page.keyboard.press("Backspace");
    await expect(page.locator(EDITOR)).toHaveText(STORED);
    await expect(saveStatus(page), "status settles").toHaveText(m.savedLabel, { timeout: 10_000 });
    await page.waitForTimeout(3000);
    await expect(saveStatus(page), "and stays settled").toHaveText(m.savedLabel);
    expect(norm(await m.serverContent(id)), "server").toBe(STORED);

    await reopen(page, id);
    expect(norm(await page.locator(EDITOR).innerText()), "editor after reload").toBe(STORED);
    expect(norm(await idbContent(page, id)), "IndexedDB after reload").toBe(STORED);
    expect(norm(await m.serverContent(id)), "server after reload").toBe(STORED);
  });

  test("(c) an edit undone before the autosave fires: status settles, nothing comes back", async ({ page }) => {
    test.setTimeout(90_000);
    const m = mode();
    await instrument(page);
    const id = await seedStoredNote(page, m);
    await page.locator(`[data-note-card="${id}"]`).click();
    await expect(page.locator(EDITOR)).toContainText(STORED);
    await page.waitForTimeout(2000); // well past the load window
    await page.locator(EDITOR).click();
    await page.keyboard.press("End");
    await page.keyboard.type("Z");
    await page.waitForTimeout(900); // the 500ms IndexedDB write-ahead has run; the 2s autosave hasn't
    await page.keyboard.press("Backspace");
    await expect(page.locator(EDITOR)).toHaveText(STORED);
    await expect(saveStatus(page), "status settles").toHaveText(m.savedLabel, { timeout: 10_000 });
    await page.waitForTimeout(3000);
    await expect(saveStatus(page), "and stays settled").toHaveText(m.savedLabel);
    expect(norm(await idbContent(page, id)), "IndexedDB").toBe(STORED);
    expect(norm(await m.serverContent(id)), "server").toBe(STORED);

    await reopen(page, id);
    expect(norm(await page.locator(EDITOR).innerText()), "editor after reload").toBe(STORED);
    expect(norm(await idbContent(page, id)), "IndexedDB after reload").toBe(STORED);
    expect(norm(await m.serverContent(id)), "server after reload").toBe(STORED);
  });

  // Toolbar commands. Heading 1 needs only the caret; Bold needs the text
  // selected (select-all is not an editing key, so the window stays open).
  const toolbarCases = [
    { button: "Heading 1", select: false, md: `# ${STORED}`, el: "h1" },
    { button: "Bold", select: true, md: `**${STORED}**`, el: "strong" },
  ];
  for (const tc of toolbarCases) {
    test(`(d) ${tc.button} from the toolbar in the first second survives a reload`, async ({ page }) => {
      test.setTimeout(90_000);
      const m = mode();
      await instrument(page);
      const id = await seedStoredNote(page, m);
      // The consent banner sits over the docked toolbar.
      const decline = page.getByRole("button", { name: "Decline" }).first();
      if (await decline.isVisible()) await decline.click();
      const mountsBefore = await page.evaluate(() => (window as any).__lw.mounts.length);
      await page.locator(`[data-note-card="${id}"]`).click();
      const ed = page.locator(EDITOR);
      await expect(ed).toContainText(STORED);
      if (tc.select) {
        await ed.click();
        await page.keyboard.press("Control+a");
      }
      await page.getByRole("button", { name: tc.button, exact: true }).click();
      const ms = await page.evaluate(({ before, key }) => {
        const lw = (window as any).__lw;
        const mount = lw.mounts[lw.mounts.length - 1];
        const press = [...lw.keys].reverse().find((k: { key: string }) => k.key === key);
        return lw.mounts.length > before && press ? press.t - mount : Number.POSITIVE_INFINITY;
      }, { before: mountsBefore, key: `button:${tc.button}` });
      console.log(`[load-window] (d) ${tc.button} clicked ${Math.round(ms)}ms after the editor mounted`);
      test.skip(ms >= LOAD_WINDOW_MS, `click landed ${Math.round(ms)}ms after mount — load window not exercised`);
      await expect(ed.locator(tc.el)).toHaveText(STORED);

      await expect.poll(async () => norm(await m.serverContent(id)), { timeout: 15_000 }).toBe(tc.md);
      await expect(saveStatus(page)).toHaveText(m.savedLabel, { timeout: 10_000 });
      expect(norm(await idbContent(page, id)), "IndexedDB before reload").toBe(tc.md);

      await reopen(page, id);
      await expect(page.locator(EDITOR).locator(tc.el), "editor after reload").toHaveText(STORED);
      expect(norm(await idbContent(page, id)), "IndexedDB after reload").toBe(tc.md);
      expect(norm(await m.serverContent(id)), "server after reload").toBe(tc.md);
    });
  }

  test("(e) a failed save, then deleted back to the saved text: nothing is pushed later", async ({ page }) => {
    test.setTimeout(120_000);
    const m = mode();
    await instrument(page);
    const id = await seedStoredNote(page, m);
    await page.locator(`[data-note-card="${id}"]`).click();
    await expect(page.locator(EDITOR)).toContainText(STORED);
    await page.waitForTimeout(2000); // past the load window, ownership settled

    const restore = await failServerActions(page);
    await page.locator(EDITOR).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" ZZ");
    await expect(saveStatus(page), "the save fails").toHaveText("Not saved", { timeout: 15_000 });
    await expect.poll(async () => (await queuedUpdates(page, id)).map(norm), { timeout: 10_000 }).toContain(`${STORED} ZZ`);

    for (let i = 0; i < 3; i++) await page.keyboard.press("Backspace");
    await expect(page.locator(EDITOR)).toHaveText(STORED);
    await expect(saveStatus(page), "status settles").toHaveText(m.savedLabel, { timeout: 10_000 });
    await expect.poll(() => queuedUpdates(page, id), { timeout: 5_000 }).toEqual([]);
    expect(norm(await idbContent(page, id)), "IndexedDB").toBe(STORED);

    await restore();
    await page.waitForTimeout(3000);
    await reopen(page, id);
    await page.waitForTimeout(3000); // any queue replay the startup makes
    expect(norm(await page.locator(EDITOR).innerText()), "editor after reload").toBe(STORED);
    expect(norm(await m.serverContent(id)), "server after reload").toBe(STORED);
    expect(await queuedUpdates(page, id), "queue after reload").toEqual([]);
  });

  test("(f) offline text, reloaded offline, a character typed and deleted: still reaches the server", async ({ page }) => {
    test.setTimeout(150_000);
    const m = mode();
    await instrument(page);
    const id = await seedStoredNote(page, m);
    const OFFLINE = `${STORED} written offline`;

    // Offline: the edit is cached unsynced and its save queued.
    const restore = await goOffline(page);
    await page.locator(`[data-note-card="${id}"]`).click();
    await expect(page.locator(EDITOR)).toContainText(STORED);
    await page.waitForTimeout(2000); // past the load window, ownership settled
    await page.locator(EDITOR).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" written offline", { delay: 20 });
    await expect(saveStatus(page), "the save fails").toHaveText("Not saved", { timeout: 15_000 });
    await expect.poll(async () => norm(await idbContent(page, id))).toBe(OFFLINE);
    expect(await idbLocalEdit(page, id), "cached copy is unsynced").toBeTruthy();
    const queuedAtOpen = (await queuedUpdates(page, id)).map(norm);
    console.log(`[load-window] (f) queued before reload: ${JSON.stringify(queuedAtOpen)}`);

    // Reload, still offline: the note opens on its unsynced cached text.
    await page.reload();
    await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
    await page.locator(`[data-note-card="${id}"]`).click();
    await expect(page.locator(EDITOR)).toContainText(OFFLINE, { timeout: 20_000 });
    await page.waitForTimeout(2500); // past the load window, ownership settled
    const queuedAfterReload = (await queuedUpdates(page, id)).map(norm);
    console.log(`[load-window] (f) queued after reload: ${JSON.stringify(queuedAfterReload)}`);

    // One character typed and deleted before its save goes out.
    await page.locator(EDITOR).click();
    await page.keyboard.press("End");
    await page.keyboard.type("x");
    await page.waitForTimeout(900); // the 500ms IndexedDB write-ahead has run; the 2s autosave hasn't
    await page.keyboard.press("Backspace");
    await expect(page.locator(EDITOR)).toHaveText(OFFLINE);
    await page.waitForTimeout(3000);
    expect(norm(await idbContent(page, id)), "IndexedDB").toBe(OFFLINE);
    expect.soft(await idbLocalEdit(page, id), "still unsynced after the delete-back").toBeTruthy();
    expect.soft((await queuedUpdates(page, id)).map(norm), "queue entries from open kept").toEqual(queuedAfterReload);
    expect(norm(await m.serverContent(id)), "server still has the old text").toBe(STORED);

    // Network back: the offline text reaches the server.
    await restore();
    await reopen(page, id);
    await expect.poll(async () => norm(await m.serverContent(id)), { timeout: 20_000 }).toBe(OFFLINE);
    expect(norm(await page.locator(EDITOR).innerText()), "editor after reload").toBe(OFFLINE);
    await page.waitForTimeout(2000);
    await page.reload(); // a later refresh must not bring the older server copy back
    await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
    await page.locator(`[data-note-card="${id}"]`).click();
    await expect(page.locator(EDITOR)).toContainText(OFFLINE, { timeout: 20_000 });
    expect(norm(await m.serverContent(id)), "server after a later refresh").toBe(OFFLINE);
  });
}

test.describe("keystrokes right after a note opens — local (guest) note", () => {
  let redis: Redis;
  let anonId: string | null = null;
  test.beforeEach(() => {
    redis = new Redis(process.env.VALKEY_URL || "redis://127.0.0.1:6380", { keyPrefix: "justnoted:" });
  });
  test.afterEach(() => redis.disconnect());

  cases(() => ({
    savedLabel: "Saved",
    createNote: async (page) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
      await page.getByRole("main", { name: "Note editor" }).getByRole("button", { name: "New note" }).click();
      await expect(page.locator(EDITOR)).toBeVisible();
      await expect.poll(() => editorFocused(page)).toBe(true);
      await expect.poll(() => activeId(page)).not.toBeNull();
      anonId = await page.evaluate(() => localStorage.getItem("notes_user_id"));
      return (await activeId(page))!;
    },
    serverContent: async (noteId) => {
      const raw = await redis.hget(`notes:${anonId}`, noteId);
      return raw ? (JSON.parse(raw).content as string) : null;
    },
  }));
});

test.describe("keystrokes right after a note opens — cloud note", () => {
  test.skip(seededAccounts().length < 1, "needs seeded accounts (service-role key)");

  cases(() => ({
    savedLabel: "Synced",
    createNote: async (page) => {
      const [acc] = seededAccounts();
      await signIn(page, acc);
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
      await expect(page.locator("[data-note-card]").first()).toBeVisible();
      await page.waitForTimeout(1000);
      const before = await activeId(page);
      await page.locator("body").press("Control+j");
      await expect.poll(() => activeId(page)).not.toBe(before);
      await expect.poll(() => editorFocused(page)).toBe(true);
      return (await activeId(page))!;
    },
    serverContent: async (noteId) => {
      const { data } = await adminClient().from("notes").select("content").eq("id", noteId).maybeSingle();
      return (data as { content: string } | null)?.content ?? null;
    },
  }));
});
