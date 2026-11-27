import Redis from "ioredis";
import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures/no-conflicts";
import { seededAccounts, signIn, type SeededAccount } from "./fixtures/auth";
import { adminClient, hasAdminEnv } from "./fixtures/admin";
import { e2eFileEnv } from "./fixtures/env";

// Text typed just before a tab closes (docs/tickets/flaky-pagehide-second-tab-e2e.md).
// The close path has four writers, any of which may be lost when the page dies:
//   1. the IDB cache copy, 2. the offline-queue entry (both committed
//   synchronously), 3. a BroadcastChannel handoff to this browser's other
//   tabs, 4. a keepalive save (guest and cloud; skipped over the 64 KiB cap).
// These specs knock out the network ones on purpose and check the rest bring
// the text back — and that a tab taking the note over never types over it.
//
// Losing the network saves: with no other tab, the context goes offline for
// the close and the page's fetch fails from that moment (nothing can leave;
// see typeAndCloseOffline). With a second tab open (it must stay online),
// the keepalive is dropped by a test hook on /api/notes/leave-save — with
// E2E_TEST_HOOKS=1 on the server (playwright.config.ts) the
// `e2e_drop_leave_save=1` cookie makes it accept and not save, proven at the
// API by the first spec (a server started without the flag fails it) — and
// the page's own server-action save is aborted by page.route.

const EDITOR = ".ProseMirror";
const editor = (p: Page) => p.locator(EDITOR).first();
const waitForApp = (p: Page) => expect(p.getByRole("heading", { name: "All Notes" })).toBeVisible();
const card = (p: Page, id: string) => p.locator(`[data-note-card="${id}"]`);
const BASE = process.env.E2E_BASE_URL || "http://localhost:3050";
const COPY_MARK = "(conflicted copy";

async function activeCardId(page: Page): Promise<string> {
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector('[data-note-card][data-active="true"]')?.getAttribute("data-note-card") ?? null),
    )
    .not.toBeNull();
  return (await page.evaluate(
    () => document.querySelector('[data-note-card][data-active="true"]')!.getAttribute("data-note-card"),
  ))!;
}

async function newGuestNote(page: Page): Promise<{ id: string; anon: string }> {
  await page.goto("/");
  await waitForApp(page);
  await page.getByRole("main", { name: "Note editor" }).getByRole("button", { name: "New note" }).click();
  await expect(editor(page)).toBeVisible();
  const id = await activeCardId(page);
  const anon = (await page.evaluate(() => localStorage.getItem("notes_user_id")))!;
  await page.waitForTimeout(2500); // the create lands; only the text is at risk
  return { id, anon };
}

async function newCloudNote(page: Page, acc: SeededAccount): Promise<string> {
  await signIn(page, acc);
  await page.goto("/");
  await waitForApp(page);
  const before = await page.evaluate(
    () => document.querySelector('[data-note-card][data-active="true"]')?.getAttribute("data-note-card") ?? null,
  );
  await page.locator("body").press("Control+j");
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector('[data-note-card][data-active="true"]')?.getAttribute("data-note-card") ?? null),
    )
    .not.toBe(before);
  await expect(editor(page)).toBeVisible();
  const id = await activeCardId(page);
  await expect.poll(() => cloudContent(id), { timeout: 15_000 }).not.toBeNull(); // the create landed
  return id;
}

function valkey() {
  return new Redis(e2eFileEnv().VALKEY_URL || process.env.VALKEY_URL || "redis://127.0.0.1:6380", {
    keyPrefix: "justnoted:",
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
}

async function guestNotes(anon: string): Promise<{ id: string; title: string; content: string }[]> {
  const r = valkey();
  try {
    const all = await r.hgetall(`notes:${anon}`);
    return Object.values(all).map((raw) => {
      const n = JSON.parse(raw);
      return { id: n.id, title: String(n.title ?? ""), content: String(n.content ?? "") };
    });
  } finally {
    r.disconnect();
  }
}
async function noteVersion(anon: string, id: string): Promise<number> {
  const r = valkey();
  try {
    const raw = await r.hget(`notes:${anon}`, id);
    return raw ? JSON.parse(raw).version ?? 1 : 1;
  } finally {
    r.disconnect();
  }
}
async function guestContent(anon: string, id: string): Promise<string> {
  return (await guestNotes(anon)).find((n) => n.id === id)?.content ?? "";
}

async function cloudContent(id: string): Promise<string | null> {
  const { data } = await adminClient().from("notes").select("content").eq("id", id).maybeSingle();
  return (data?.content as string | undefined) ?? null;
}
async function cloudNotesWith(acc: SeededAccount, text: string) {
  const { data } = await adminClient()
    .from("notes")
    .select("id, title, content")
    .eq("author", acc.id)
    .ilike("content", `%${text}%`);
  return (data ?? []) as { id: string; title: string; content: string }[];
}

/** Lose the close-time NETWORK saves: the keepalive (server test hook) and any
 *  server action carrying `marker` from `page` (aborted before it leaves). */
async function dropNetworkSaves(ctx: BrowserContext, page: Page, marker: string) {
  await ctx.addCookies([{ name: "e2e_drop_leave_save", value: "1", url: BASE }]);
  await page.route("**/*", (route) => {
    const r = route.request();
    if (r.method() === "POST" && !r.url().includes("/api/notes/leave-save") && (r.postData() ?? "").includes(marker)) {
      return route.abort();
    }
    return route.fallback();
  });
}

/** Record this page's keepalive fetches in localStorage (synchronous), plus a
 *  pagehide mark proving the record was taken. Read back from another tab. */
async function recordKeepalives(page: Page) {
  await page.addInitScript(() => {
    const log = (s: string) => {
      try {
        const cur = JSON.parse(localStorage.getItem("__e2e_keepalive") || "[]");
        cur.push(s);
        localStorage.setItem("__e2e_keepalive", JSON.stringify(cur));
      } catch {}
    };
    const orig = window.fetch;
    window.fetch = function (this: unknown, input: any, init?: any) {
      if (init?.keepalive) log(`keepalive ${typeof input === "string" ? input : input?.url} ${String(init.body ?? "").length}`);
      return orig.call(this, input, init);
    } as typeof fetch;
    addEventListener("pagehide", () => log("pagehide"));
  });
}

/**
 * Make every fetch from this page fail once `window.__e2eNetDown` is set (see
 * typeAndCloseOffline). Install before the page's first navigation, so the app
 * only ever sees the wrapped fetch.
 */
async function failFetchesWhenNetDown(page: Page) {
  await page.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
      if ((window as any).__e2eNetDown) return Promise.reject(new TypeError("Failed to fetch"));
      return orig.apply(this, args);
    } as typeof fetch;
  });
}

/**
 * Type, then close with NO network save able to leave, then go back online for
 * whatever opens next. The page must have failFetchesWhenNetDown installed.
 *
 * context.setOffline alone is not enough: a request the page starts late in
 * its teardown (after visibilitychange→hidden; here the autosave flush) is not
 * held by Chromium's offline emulation and reaches the server — 12 of 20 runs
 * in e2e/diag-offline-close.spec.ts. page.route has the same gap. So the page's
 * own fetch fails too, from the moment the network is cut.
 */
async function typeAndCloseOffline(ctx: BrowserContext, page: Page, marker: string) {
  await editor(page).click();
  await page.keyboard.press("End");
  await page.keyboard.type(marker);
  await expect(editor(page)).toContainText(marker);
  await page.evaluate(() => ((window as any).__e2eNetDown = true));
  await ctx.setOffline(true);
  const closed = page.waitForEvent("close");
  await page.close({ runBeforeUnload: true });
  await closed; // really gone before the network comes back
  await ctx.setOffline(false);
}

function keepaliveLog(p: Page): Promise<string[]> {
  return p.evaluate(() => JSON.parse(localStorage.getItem("__e2e_keepalive") || "[]"));
}

async function typeAndClose(page: Page, marker: string) {
  await editor(page).click();
  await page.keyboard.press("End");
  await page.keyboard.type(marker);
  await expect(editor(page)).toContainText(marker); // it really was in the editor
  await page.close({ runBeforeUnload: true }); // inside the debounce
}

// ── Guest ───────────────────────────────────────────────────────────────────

test.describe("closing a tab right after typing — guest", () => {
  // The keepalive drop hook itself, at the API: with the cookie the route
  // accepts and saves nothing; without it the same request saves.
  test("leave-save drop hook (E2E_TEST_HOOKS=1): dropped with the cookie, saved without", async ({ page }) => {
    const { id, anon } = await newGuestNote(page);
    const version = await noteVersion(anon, id);
    const body = (content: string) => ({
      source: "redis",
      userId: anon,
      noteId: id,
      content,
      goal: 0,
      goalType: "",
      baseVersion: version,
      copyId: crypto.randomUUID(),
      copyStamp: "e2e",
    });
    const dropped = await page.request.post("/api/notes/leave-save", {
      data: body("dropped text"),
      headers: { cookie: "e2e_drop_leave_save=1", origin: BASE },
    });
    expect(dropped.status(), "server started with E2E_TEST_HOOKS=1?").toBe(202);
    expect(await dropped.json()).toMatchObject({ dropped: true });
    expect(await guestContent(anon, id)).not.toContain("dropped text");

    const saved = await page.request.post("/api/notes/leave-save", { data: body("saved text"), headers: { origin: BASE } });
    expect(saved.status()).toBe(200);
    expect(await guestContent(anon, id)).toContain("saved text");
  });

  test("the text reaches the server with no tab left open (keepalive)", async ({ page }) => {
    const { id, anon } = await newGuestNote(page);
    const marker = `e2e-leave-${Date.now()}`;
    await typeAndClose(page, marker);
    // Another device loads from the server: nothing in this browser reopens.
    await expect.poll(() => guestContent(anon, id), { timeout: 10_000 }).toContain(marker);
  });

  test("network lost at close, no other tab: the queue/cache bring it back on the next open", async ({ context, page }) => {
    await failFetchesWhenNetDown(page);
    const { id, anon } = await newGuestNote(page);
    const marker = `e2e-leave-${Date.now()}`;
    await typeAndCloseOffline(context, page, marker);
    await new Promise((r) => setTimeout(r, 5000));
    expect(await guestContent(anon, id), "no network save got out").not.toContain(marker);

    const again = await context.newPage();
    await again.goto("/");
    await waitForApp(again);
    await expect(card(again, id)).toContainText(marker, { timeout: 20_000 });
    await expect.poll(() => guestContent(anon, id), { timeout: 15_000 }).toContain(marker);
  });

  test("keepalive dropped, a second tab open: it takes the text over at once", async ({ context, page }) => {
    const { id, anon } = await newGuestNote(page);
    const other = await context.newPage();
    await other.goto("/");
    await waitForApp(other);
    await expect(card(other, id)).toBeVisible();
    const marker = `e2e-leave-${Date.now()}`;
    await dropNetworkSaves(context, page, marker);
    await page.bringToFront();
    await typeAndClose(page, marker);
    // No focus, no reload: the handoff alone.
    await expect(card(other, id)).toContainText(marker, { timeout: 10_000 });
    await expect(editor(other)).toContainText(marker);
    await expect.poll(() => guestContent(anon, id), { timeout: 15_000 }).toContain(marker);
  });

  test("a note over the keepalive cap: no keepalive, and the text still survives", async ({ context, page }) => {
    await recordKeepalives(page);
    const { id, anon } = await newGuestNote(page);
    const other = await context.newPage();
    await other.goto("/");
    await waitForApp(other);
    await page.bringToFront();
    await editor(page).click();
    // ~90 KB: over the 60 KB keepalive cap (64 KiB browser limit).
    await page.keyboard.insertText("lorem ipsum dolor sit amet ".repeat(3400));
    const marker = `e2e-leave-big-${Date.now()}`;
    await dropNetworkSaves(context, page, marker); // only the handoff / IDB may carry it
    await typeAndClose(page, marker);

    await expect(card(other, id)).toContainText("lorem ipsum", { timeout: 10_000 });
    await expect(editor(other)).toContainText(marker, { timeout: 10_000 });
    await expect.poll(() => keepaliveLog(other), { timeout: 10_000, message: "the closing page's record" }).toContain(
      "pagehide",
    );
    const log = await keepaliveLog(other);
    expect(log.filter((l) => l.includes("/api/notes/leave-save")), "no keepalive over the cap").toEqual([]);
    await expect.poll(() => guestContent(anon, id), { timeout: 20_000 }).toContain(marker);
    expect((await guestContent(anon, id)).length).toBeGreaterThan(90_000);
  });

  // The overwrite risk: tab 2 takes the note over and the user types there.
  // Whatever the order, nothing from tab 1 may be lost: it is adopted (and the
  // user's words land on top) or it becomes a conflicted copy.
  test("tab 2 takes over and the user types at once: tab 1's text is not lost", async ({
    context,
    page,
    allowConflictedCopies,
  }) => {
    allowConflictedCopies(); // a copy is an allowed outcome here
    const { id, anon } = await newGuestNote(page);
    const other = await context.newPage();
    await other.goto("/");
    await waitForApp(other);
    await expect(card(other, id)).toBeVisible();
    const t1 = `e2e-tab1-${Date.now()}`;
    const t2 = `e2e-tab2-${Date.now()}`;
    await dropNetworkSaves(context, page, t1);
    await page.bringToFront();
    await typeAndClose(page, t1);

    // Type in tab 2 the moment its editor is editable.
    await other.bringToFront();
    await expect(editor(other)).toHaveAttribute("contenteditable", "true", { timeout: 10_000 });
    await editor(other).click();
    await other.keyboard.press("End");
    await other.keyboard.type(t2);
    await expect(editor(other)).toContainText(t2);

    await expect
      .poll(async () => {
        const notes = await guestNotes(anon);
        const main = notes.find((n) => n.id === id)?.content ?? "";
        const t1Somewhere = notes.some((n) => n.content.includes(t1));
        return main.includes(t2) && t1Somewhere;
      }, { timeout: 20_000 })
      .toBe(true);
    // If tab 1's text isn't in the note itself, it's in exactly one copy.
    const notes = await guestNotes(anon);
    if (!notes.find((n) => n.id === id)!.content.includes(t1)) {
      expect(notes.filter((n) => n.title.includes(COPY_MARK) && n.content.includes(t1))).toHaveLength(1);
    }
  });

  // Same risk, forced: the handoff reaches tab 2 AFTER the user has typed
  // there (a closing tab posted late). The user's words stay the note; the
  // other tab's text becomes a conflicted copy at once — not adopted over them.
  test("a late handoff to an editor already typed in becomes a conflicted copy", async ({
    context,
    page,
    allowConflictedCopies,
  }) => {
    allowConflictedCopies();
    const { id, anon } = await newGuestNote(page);
    const t2 = `e2e-tab2-${Date.now()}`;
    await editor(page).click();
    await page.keyboard.type(t2);
    await expect.poll(() => guestContent(anon, id), { timeout: 10_000 }).toContain(t2);
    const version = await page.evaluate(
      async (id) =>
        await new Promise<number>((res) => {
          const r = indexedDB.open("NotesCacheDB");
          r.onsuccess = () => {
            const q = r.result.transaction("notes").objectStore("notes").get(id);
            q.onsuccess = () => res(q.result?.version ?? 1);
          };
        }),
      id,
    );
    await page.keyboard.type(" more"); // dirty: an unsaved edit in the owning editor

    // Another "tab" of this browser posts a closing handoff for the same note.
    const late = `e2e-late-${Date.now()}`;
    const poster = await context.newPage();
    await poster.goto("/api/version"); // same origin, no app
    await poster.evaluate(
      ({ id, anon, late, version }) =>
        new BroadcastChannel("justnoted-leave").postMessage({
          noteId: id,
          source: "redis",
          userId: anon,
          content: late,
          goal: 0,
          goalType: "",
          baseVersion: version,
          copyId: crypto.randomUUID(),
          from: "e2e-poster",
        }),
      { id, anon, late, version },
    );

    await expect
      .poll(async () => (await guestNotes(anon)).filter((n) => n.title.includes(COPY_MARK) && n.content.includes(late)).length, {
        timeout: 15_000,
      })
      .toBe(1);
    await expect(editor(page)).toContainText(`${t2} more`);
    await expect(editor(page)).not.toContainText(late);
    await expect.poll(() => guestContent(anon, id), { timeout: 10_000 }).toContain(`${t2} more`);
  });
});

// ── Cloud ───────────────────────────────────────────────────────────────────

test.describe("closing a tab right after typing — cloud", () => {
  test.skip(!hasAdminEnv() || seededAccounts().length < 1, "needs seeded accounts");
  const made: string[] = [];
  test.afterEach(async () => {
    if (made.length) await adminClient().from("notes").delete().in("id", made.splice(0));
  });

  test("network lost at close: the queue/cache bring it back, then another device sees it", async ({
    browser,
    context,
    page,
  }) => {
    const [acc] = seededAccounts();
    await failFetchesWhenNetDown(page);
    const id = await newCloudNote(page, acc);
    made.push(id);
    const marker = `e2e-leave-cloud-${Date.now()}`;
    await typeAndCloseOffline(context, page, marker);
    await new Promise((r) => setTimeout(r, 5000));
    expect(await cloudContent(id), "no network save got out").not.toContain(marker);

    const again = await context.newPage();
    await again.goto("/");
    await waitForApp(again);
    await expect(card(again, id)).toContainText(marker, { timeout: 20_000 });
    await expect.poll(() => cloudContent(id), { timeout: 15_000 }).toContain(marker);

    const device2 = await browser.newContext();
    try {
      await signIn(device2, acc);
      const d2 = await device2.newPage();
      await d2.goto("/");
      await waitForApp(d2);
      await expect(card(d2, id)).toContainText(marker, { timeout: 20_000 });
    } finally {
      await device2.close();
    }
  });

  test("a note over the keepalive cap: a second tab takes it over", async ({ context, page }) => {
    const [acc] = seededAccounts();
    await recordKeepalives(page);
    const id = await newCloudNote(page, acc);
    made.push(id);
    const other = await context.newPage();
    await other.goto("/");
    await waitForApp(other);
    await page.bringToFront();
    await editor(page).click();
    await page.keyboard.insertText("lorem ipsum dolor sit amet ".repeat(3400));
    const marker = `e2e-leave-cloud-big-${Date.now()}`;
    await dropNetworkSaves(context, page, marker);
    await typeAndClose(page, marker);

    await expect(card(other, id)).toBeVisible();
    // localStorage reaches other tabs asynchronously: wait for the close's mark.
    await expect.poll(() => keepaliveLog(other), { timeout: 10_000 }).toContain("pagehide");
    const log = await keepaliveLog(other);
    expect(log.filter((l) => l.includes("/api/notes/leave-save")), "no keepalive over the cap").toEqual([]);
    await expect.poll(() => cloudContent(id), { timeout: 20_000 }).toContain(marker);
    expect(await cloudNotesWith(acc, marker)).toHaveLength(1); // no copy of our own text
  });
});
