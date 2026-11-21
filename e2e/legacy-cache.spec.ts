import type { Page } from "@playwright/test";
import Redis from "ioredis";
import { test, expect } from "./fixtures/no-conflicts";

// First load after the deploy that introduced the IndexedDB `localEdit` flag.
// Cache records written by older builds carry no flag, so an edit the old build
// never got to the server looks exactly like a stale cached copy. One time per
// device (and source), an unflagged cached copy that differs from the server
// and is NEWER than it is kept as a "(conflicted copy)" — never pushed over the
// note, never discarded. After that load the flag rules alone apply.
//
// Guest (Redis) only: guest notes are per browser context, so the copy this
// test makes on purpose can't trip another parallel test's no-conflicted-copies
// check, as a copy on a shared seeded cloud account would. reconcileNotes'
// source handling is covered by unit tests (notes-merge.test.ts).

const EDITOR = ".ProseMirror";
const MARKERS = ["jn_localedit_cache_v1:redis", "jn_localedit_cache_v1:supabase"];
const norm = (s: string | null | undefined) => (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const activeId = (page: Page) =>
  page.evaluate(() =>
    document.querySelector('[data-note-card][data-active="true"]')?.getAttribute("data-note-card") ?? null);

/**
 * Rewrite this note's cached record the way an older build left it: different
 * text, no localEdit flag, updated just now. Done from a static same-origin
 * page, so no running app can rewrite the cache in between.
 */
async function seedOldBuildCache(page: Page, noteId: string, content: string, opts: { clearMarkers: boolean }) {
  await page.goto("/robots.txt");
  await page.evaluate(
    async ({ noteId, content, markers, clearMarkers }) => {
      if (clearMarkers) for (const k of markers) localStorage.removeItem(k);
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open("NotesCacheDB");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      await new Promise<void>((res, rej) => {
        const tx = db.transaction("notes", "readwrite");
        const store = tx.objectStore("notes");
        const g = store.get(noteId);
        g.onsuccess = () => {
          if (!g.result) return rej(new Error("note not in cache"));
          const { localEdit: _drop, ...rec } = g.result;
          store.put({ ...rec, content, contentFormat: "markdown", updatedAt: Date.now() });
        };
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      db.close();
    },
    { noteId, content, markers: MARKERS, clearMarkers: opts.clearMarkers },
  );
}

test("first load after the localEdit deploy keeps a newer unflagged cached copy as a conflicted copy, once", async ({
  page,
  allowConflictedCopies,
}) => {
  test.setTimeout(120_000);
  allowConflictedCopies(); // this test makes exactly one on purpose (asserted below)

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
  await page.getByRole("main", { name: "Note editor" }).getByRole("button", { name: "New note" }).click();
  await expect(page.locator(EDITOR).first()).toBeVisible();
  await expect.poll(() => activeId(page)).not.toBeNull();
  const noteId = (await activeId(page))!;
  const anonId = await page.evaluate(() => localStorage.getItem("notes_user_id"));

  const redis = new Redis(process.env.VALKEY_URL || "redis://127.0.0.1:6380", { keyPrefix: "justnoted:" });
  const notes = async () =>
    Object.values(await redis.hgetall(`notes:${anonId}`)).map((r) => JSON.parse(r) as { id: string; title: string; content: string });
  const copies = async () => (await notes()).filter((n) => n.title.includes("(conflicted copy"));
  const original = async () => (await notes()).find((n) => n.id === noteId);

  try {
    await page.locator(EDITOR).first().click();
    await page.keyboard.type("saved on the server", { delay: 30 });
    await expect.poll(async () => norm((await original())?.content), { timeout: 15_000 }).toBe("saved on the server");
    await page.waitForTimeout(1500); // cache settles on the landed save

    // An older build left a newer, never-sent edit in the cache.
    await seedOldBuildCache(page, noteId, "typed on the old build, never sent", { clearMarkers: true });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();

    // Kept as ONE conflicted copy; the note itself is untouched.
    await expect.poll(async () => (await copies()).map((n) => norm(n.content)), { timeout: 15_000 })
      .toEqual(["typed on the old build, never sent"]);
    expect(norm((await original())?.content)).toBe("saved on the server");
    await expect(page.locator("[data-note-card]").filter({ hasText: "conflicted copy" })).toHaveCount(1);
    // The check is recorded for this device once the copy has landed.
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem("jn_localedit_cache_v1:redis"))).toBe(true);

    // One-time only: the same kind of unflagged, newer cache on a later load is
    // a stale cache under the flag rules — dropped, no second copy.
    await seedOldBuildCache(page, noteId, "an unflagged copy after the check", { clearMarkers: false });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
    await page.waitForTimeout(5000); // reconcile + any background push
    expect((await copies()).length).toBe(1);
    expect(norm((await original())?.content)).toBe("saved on the server");
  } finally {
    redis.disconnect();
  }
});
