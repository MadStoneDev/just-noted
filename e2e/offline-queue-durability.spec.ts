import type { BrowserContext, Page, Route } from "@playwright/test";
import Redis from "ioredis";
import { combineChunks, createChunks, stringFromBase64URL, stringToBase64URL } from "@supabase/ssr";
import { test, expect } from "./fixtures/no-conflicts";
import { seededAccounts, signIn, type SeededAccount } from "./fixtures/auth";
import { adminClient } from "./fixtures/admin";

// The offline queue keeps unsynced writing through anything short of the user
// choosing to lose it (src/utils/sign-out.ts):
//
// Durability
//   (1) an edit made offline is still queued after the tab closes (the
//       tab-close keepalive save is refused too), and reaches the server once
//       the network is back — guest and cloud notes.
// Sign-out
//   (2) the session is revoked server-side and its token refresh fails
//       (supabase-js signs the tab out itself): the queued cloud edit and its
//       unsynced cached copy survive, the "signed out — sign in to sync" notice
//       shows, and after signing back in the edit replays through the CAS.
//   (3) a sign-out the user starts with an unsynced edit waits for the sync;
//       Cancel keeps everything (still signed in, entry and copy kept); if the
//       sync fails, "Sign out anyway" is offered; once the network is back the
//       sign-out completes after the edit lands, clearing only that account's
//       cloud data.
//   (4) guest (local) notes, with an unsynced edit of their own, survive both
//       kinds of sign-out.
// Every test also fails on any conflicted copy (fixtures/no-conflicts).

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3050";
const MAIN = 'main[aria-label="Note editor"]';
const EDITOR = `${MAIN} .ProseMirror`;

const norm = (s: string | null | undefined) => (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const activeId = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-note-card][data-active="true"]')?.getAttribute("data-note-card") ?? null);
const editorFocused = (page: Page) => page.evaluate(() => !!document.activeElement?.closest(".ProseMirror"));
const saveStatus = (page: Page) => page.locator(`${MAIN} [data-testid="save-status"]`);

// ── IndexedDB probes ─────────────────────────────────────────────────────────

interface CachedCopy {
  content: string;
  localEdit: number | false;
  account: string | null;
  source: string;
}
async function idbNote(page: Page, noteId: string): Promise<CachedCopy | null> {
  return page.evaluate(
    (id) =>
      new Promise<CachedCopy | null>((resolve) => {
        const req = indexedDB.open("NotesCacheDB");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction("notes", "readonly").objectStore("notes").get(id);
          get.onsuccess = () => {
            const r = get.result;
            resolve(r ? { content: r.content, localEdit: r.localEdit ?? false, account: r.account ?? null, source: r.source } : null);
            db.close();
          };
          get.onerror = () => { resolve(null); db.close(); };
        };
      }),
    noteId,
  );
}

interface QueuedOp {
  type: string;
  noteId: string;
  source: string;
  userId: string;
  content?: string;
}
async function queued(page: Page, noteId?: string): Promise<QueuedOp[]> {
  return page.evaluate(
    (id) =>
      new Promise<QueuedOp[]>((resolve) => {
        const req = indexedDB.open("OfflineQueueDB");
        req.onerror = () => resolve([]);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("operations")) { db.close(); resolve([]); return; }
          const all = db.transaction("operations", "readonly").objectStore("operations").getAll();
          all.onsuccess = () => {
            resolve(
              (all.result as { payload: QueuedOp }[])
                .map((o) => o.payload)
                .filter((p) => !id || p.noteId === id),
            );
            db.close();
          };
          all.onerror = () => { resolve([]); db.close(); };
        };
      }),
    noteId,
  );
}
const queuedTexts = async (page: Page, noteId: string) =>
  (await queued(page, noteId)).filter((o) => o.type === "update").map((o) => norm(o.content));

// ── Network ──────────────────────────────────────────────────────────────────

/** Every server action fails at the network (note saves and loads) until undone. */
async function failServerActions(context: BrowserContext): Promise<() => Promise<void>> {
  const handler = async (route: Route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) return route.abort("internetdisconnected");
    return route.continue();
  };
  await context.route("**/*", handler);
  return () => context.unroute("**/*", handler);
}

/**
 * Offline as far as the app's data goes, while the page itself still loads:
 * server actions, the app's /api routes and every other origin fail at the
 * network until undone. Requests a closing page sends (the tab-close keepalive
 * save, the editor's last flush) aren't seen by request routing, so the page's
 * own fetch is patched to refuse /api calls and server actions too, in every
 * page of the context, while the localStorage flag is set.
 */
const OFFLINE_FLAG = "__e2eOffline";
async function goOffline(page: Page): Promise<() => Promise<void>> {
  const appOrigin = new URL(page.url()).origin;
  const handler = async (route: Route) => {
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
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const serverAction = headers.has("next-action");
      if (localStorage.getItem(flag) === "1" && (serverAction || new URL(href, location.href).pathname.startsWith("/api/"))) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return real(input, init);
    };
  };
  const context = page.context();
  await context.addInitScript(patchFetch, OFFLINE_FLAG);
  await page.evaluate(patchFetch, OFFLINE_FLAG);
  // localStorage (not sessionStorage): the flag must reach a NEW tab after a close.
  await page.evaluate((flag) => localStorage.setItem(flag, "1"), OFFLINE_FLAG);
  await context.route("**/*", handler);
  return async () => {
    await context.unroute("**/*", handler);
    for (const p of context.pages()) await p.evaluate((flag) => localStorage.removeItem(flag), OFFLINE_FLAG).catch(() => {});
  };
}

// ── Session ──────────────────────────────────────────────────────────────────

const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

/**
 * Revoke this tab's session at the auth server, the way an expired / revoked
 * session looks to the app: the refresh token is revoked (admin sign-out of
 * just this session, so parallel tests' sessions of the same account live on),
 * and the cookie's access token is marked expired so the client must refresh.
 * Making the tab visible again makes supabase-js recover the session: the
 * refresh fails, and supabase-js itself removes the session and emits
 * SIGNED_OUT to the app's auth listener. Nothing in the app is called directly.
 */
async function revokeSession(page: Page): Promise<void> {
  const context = page.context();
  const auth = (await context.cookies(BASE_URL)).filter((c) => AUTH_COOKIE.test(c.name));
  expect(auth.length, "auth cookie present").toBeGreaterThan(0);
  const key = auth[0].name.replace(/\.\d+$/, "");
  const raw = (await combineChunks(key, (n) => auth.find((c) => c.name === n)?.value)) ?? "";
  const session = JSON.parse(raw.startsWith("base64-") ? stringFromBase64URL(raw.slice(7)) : raw);

  const { error } = await adminClient().auth.admin.signOut(session.access_token, "local");
  expect(error, "admin sign-out of this session").toBeNull();

  session.expires_at = Math.floor(Date.now() / 1000) - 60;
  const value = `base64-${stringToBase64URL(JSON.stringify(session))}`;
  await context.clearCookies({ name: AUTH_COOKIE });
  await context.addCookies(
    createChunks(key, value).map((c) => ({
      name: c.name,
      value: c.value,
      url: BASE_URL,
      sameSite: "Lax" as const,
      expires: Math.floor(Date.now() / 1000) + 3600,
    })),
  );
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange", { bubbles: true })));
}

const isSignedInCookie = async (page: Page) =>
  (await page.context().cookies(BASE_URL)).some((c) => AUTH_COOKIE.test(c.name) && !!c.value);

// ── Notes ────────────────────────────────────────────────────────────────────

const redisUrl = () => process.env.VALKEY_URL || "redis://127.0.0.1:6380";

async function guestServerContent(redis: Redis, anonId: string, noteId: string): Promise<string | null> {
  const raw = await redis.hget(`notes:${anonId}`, noteId);
  return raw ? (JSON.parse(raw).content as string) : null;
}
async function cloudServerContent(noteId: string): Promise<string | null> {
  const { data } = await adminClient().from("notes").select("content").eq("id", noteId).maybeSingle();
  return (data as { content: string } | null)?.content ?? null;
}

async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible({ timeout: 30_000 });
}

/** A guest (local) note holding `text`, saved. Returns its id. */
async function createGuestNote(page: Page, redis: Redis, text: string): Promise<{ id: string; anonId: string }> {
  await page.getByRole("main", { name: "Note editor" }).getByRole("button", { name: "New note" }).click();
  await expect(page.locator(EDITOR)).toBeVisible();
  await expect.poll(() => editorFocused(page)).toBe(true);
  await expect.poll(() => activeId(page)).not.toBeNull();
  const id = (await activeId(page))!;
  const anonId = (await page.evaluate(() => localStorage.getItem("notes_user_id")))!;
  await page.keyboard.type(text, { delay: 15 });
  await expect.poll(async () => norm(await guestServerContent(redis, anonId, id)), { timeout: 15_000 }).toBe(text);
  await expect(saveStatus(page)).toHaveText("Saved", { timeout: 15_000 });
  return { id, anonId };
}

/** A cloud note holding `text`, synced (signed in). Returns its id. */
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
 * Open another, existing note so `id`'s editor closes (its queued entries are
 * then free to replay). Not Ctrl+J: a new note made while saves fail would be
 * one more unsynced note.
 */
async function closeNote(page: Page, id: string) {
  await page.locator(`[data-note-card]:not([data-note-card="${id}"])`).first().click();
  await expect.poll(() => activeId(page)).not.toBe(id);
  await page.waitForTimeout(1000);
}

/** Run `action`, which ends in a full page load (sign-out navigates to "/"). */
async function expectReload(page: Page, action: () => Promise<void>) {
  const loaded = page.waitForEvent("load", { timeout: 30_000 });
  await action();
  await loaded;
  await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible({ timeout: 30_000 });
}

/** Type `suffix` at the end of the open note while saves fail: queued + cached unsynced. */
async function unsyncedEdit(page: Page, id: string, suffix: string, expected: string) {
  await page.locator(EDITOR).click();
  await page.keyboard.press("End");
  await page.keyboard.type(suffix, { delay: 15 });
  await expect(saveStatus(page), "the save fails").toHaveText("Not saved", { timeout: 15_000 });
  await expect.poll(() => queuedTexts(page, id), { timeout: 10_000 }).toContain(expected);
  await expect.poll(async () => norm((await idbNote(page, id))?.content)).toBe(expected);
}

const accountButton = (page: Page) => page.locator('button[aria-label="Account"]:visible').first();
async function clickSignOut(page: Page) {
  const decline = page.getByRole("button", { name: "Decline" }).first();
  if (await decline.isVisible().catch(() => false)) await decline.click();
  await accountButton(page).click();
  await page.getByRole("button", { name: /^Sign out( of @.*)?$/ }).click();
}

// ── (1) Durability ───────────────────────────────────────────────────────────

test.describe("(1) an offline edit survives closing the tab", () => {
  let redis: Redis;
  test.beforeEach(() => {
    redis = new Redis(redisUrl(), { keyPrefix: "justnoted:" });
  });
  test.afterEach(() => redis.disconnect());

  async function closeAndReopenOffline(page: Page, id: string, expected: string): Promise<Page> {
    const context = page.context();
    page.on("dialog", (d) => d.accept().catch(() => {})); // a "leave site?" prompt must not keep it open
    const closed = page.waitForEvent("close");
    await page.close({ runBeforeUnload: true }); // pagehide: the keepalive save is refused
    await closed;
    const next = await context.newPage();
    await openApp(next);
    await expect.poll(() => queuedTexts(next, id), { timeout: 10_000 }).toContain(expected);
    expect(norm((await idbNote(next, id))?.content), "cached copy after the close").toBe(expected);
    expect((await idbNote(next, id))?.localEdit, "cached copy still unsynced").toBeTruthy();
    return next;
  }

  test("guest note", async ({ page }) => {
    test.setTimeout(120_000);
    await openApp(page);
    const { id, anonId } = await createGuestNote(page, redis, "guest durable");
    const EXPECTED = "guest durable typed offline";

    const restore = await goOffline(page);
    await page.locator(EDITOR).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" typed offline", { delay: 15 });
    await expect(saveStatus(page)).toHaveText("Not saved", { timeout: 15_000 });
    await expect.poll(() => queuedTexts(page, id), { timeout: 10_000 }).toContain(EXPECTED);

    const next = await closeAndReopenOffline(page, id, EXPECTED);
    expect(norm(await guestServerContent(redis, anonId, id)), "server untouched while offline").toBe("guest durable");

    await restore();
    await next.reload();
    await expect.poll(async () => norm(await guestServerContent(redis, anonId, id)), { timeout: 20_000 }).toBe(EXPECTED);
    await expect.poll(() => queued(next, id), { timeout: 10_000 }).toEqual([]);
  });

  test("cloud note", async ({ page }) => {
    test.skip(seededAccounts().length < 1, "needs seeded accounts (service-role key)");
    test.setTimeout(120_000);
    const [acc] = seededAccounts();
    await signIn(page, acc);
    await openApp(page);
    const id = await createCloudNote(page, "cloud durable");
    const EXPECTED = "cloud durable typed offline";

    const restore = await goOffline(page);
    await page.locator(EDITOR).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" typed offline", { delay: 15 });
    await expect(saveStatus(page)).toHaveText("Not saved", { timeout: 15_000 });
    await expect.poll(() => queuedTexts(page, id), { timeout: 10_000 }).toContain(EXPECTED);
    const [op] = (await queued(page, id)).filter((o) => o.type === "update");
    expect(op.userId, "cloud entry is keyed to the account, not the device").toBe(acc.id);

    const next = await closeAndReopenOffline(page, id, EXPECTED);
    expect(norm(await cloudServerContent(id)), "server untouched while offline").toBe("cloud durable");

    await restore();
    await next.reload();
    await expect.poll(async () => norm(await cloudServerContent(id)), { timeout: 20_000 }).toBe(EXPECTED);
    await expect.poll(() => queued(next, id), { timeout: 10_000 }).toEqual([]);
  });
});

// ── (2)–(4) Sign-out ─────────────────────────────────────────────────────────

test.describe("sign-out never wipes unsynced writing", () => {
  test.skip(seededAccounts().length < 1, "needs seeded accounts (service-role key)");
  let redis: Redis;
  let acc: SeededAccount;
  test.beforeEach(() => {
    redis = new Redis(redisUrl(), { keyPrefix: "justnoted:" });
    acc = seededAccounts()[0];
  });
  test.afterEach(() => redis.disconnect());

  /** Guest note first (as a guest), then sign in. */
  async function guestThenSignIn(page: Page, guestText: string) {
    await openApp(page);
    const guest = await createGuestNote(page, redis, guestText);
    await signIn(page, acc);
    await openApp(page);
    await expect(accountButton(page)).toBeVisible();
    await expect(page.locator(`[data-note-card="${guest.id}"]`), "guest note listed while signed in").toBeVisible();
    return guest;
  }

  async function expectGuestNoteKept(page: Page, guest: { id: string; anonId: string }, text: string) {
    expect(norm((await idbNote(page, guest.id))?.content), "guest note still cached").toBe(text);
    await expect(page.locator(`[data-note-card="${guest.id}"]`), "guest note still listed").toBeVisible();
    expect(norm(await guestServerContent(redis, guest.anonId, guest.id)), "guest note on the server").toBe(text);
  }

  test("(2) revoked session with a queued edit: entry and unsynced copy survive, replay after signing back in", async ({ page }) => {
    test.setTimeout(150_000);
    const guest = await guestThenSignIn(page, "guest before revoke");
    const id = await createCloudNote(page, "cloud before revoke");
    const EXPECTED = "cloud before revoke queued edit";

    const restore = await failServerActions(page.context());
    await unsyncedEdit(page, id, " queued edit", EXPECTED);
    await closeNote(page, id);

    // The session dies at the auth server; supabase-js signs the tab out.
    await revokeSession(page);
    await expect(accountButton(page), "signed out").toBeHidden({ timeout: 20_000 });
    await expect(page.getByTestId("signed-out-notice")).toContainText(
      "You’ve been signed out. Sign in to sync 1 unsaved note",
      { timeout: 15_000 },
    );

    // Nothing was wiped: the entry is still queued under the account, the
    // unsynced copy is still cached (and tagged with it), and nothing was sent.
    const ops = await queued(page, id);
    expect(ops.map((o) => [o.type, o.userId, norm(o.content)]), "queued entry kept").toContainEqual(["update", acc.id, EXPECTED]);
    const copy = await idbNote(page, id);
    expect(norm(copy?.content), "cached copy kept").toBe(EXPECTED);
    expect(copy?.localEdit, "still marked unsynced").toBeTruthy();
    expect(copy?.account, "parked under the account").toBe(acc.id);
    await expect(page.locator(`[data-note-card="${id}"]`), "cloud note not shown signed out").toHaveCount(0);

    // Back online, still signed out: still parked, never sent without the session.
    await restore();
    await page.reload();
    await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
    await expect(page.getByTestId("signed-out-notice")).toContainText("Sign in to sync 1 unsaved note");
    await page.waitForTimeout(2000);
    expect(await queuedTexts(page, id), "still parked after a signed-out reload").toContain(EXPECTED);
    expect(norm(await cloudServerContent(id)), "server untouched").toBe("cloud before revoke");
    await expectGuestNoteKept(page, guest, "guest before revoke");

    // Sign back in: the parked edit replays (through the CAS, so no copy).
    await signIn(page, acc);
    await openApp(page);
    await expect.poll(async () => norm(await cloudServerContent(id)), { timeout: 20_000 }).toBe(EXPECTED);
    await expect.poll(() => queued(page, id), { timeout: 10_000 }).toEqual([]);
    await expect(page.getByTestId("signed-out-notice")).toHaveCount(0);
    await page.locator(`[data-note-card="${id}"]`).click();
    await expect(page.locator(EDITOR)).toContainText(EXPECTED, { timeout: 20_000 });
    await expectGuestNoteKept(page, guest, "guest before revoke");
  });

  test("(3) user sign-out with an unsynced edit waits for the sync; Cancel keeps everything", async ({ page }) => {
    test.setTimeout(150_000);
    const guest = await guestThenSignIn(page, "guest before sign-out");
    const id = await createCloudNote(page, "cloud before sign-out");
    const EXPECTED = "cloud before sign-out unsynced";

    const restore = await failServerActions(page.context());
    await unsyncedEdit(page, id, " unsynced", EXPECTED);

    // Sign out → held while it syncs → Cancel: still signed in, nothing touched.
    await clickSignOut(page);
    const dialog = page.getByTestId("sign-out-dialog");
    await expect(dialog).toContainText("Syncing 1 note before signing out…");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await page.waitForTimeout(6000); // longer than the sync attempts: it really stopped
    await expect(dialog).toHaveCount(0);
    await expect(accountButton(page), "still signed in").toBeVisible();
    expect(await isSignedInCookie(page), "session cookie kept").toBe(true);
    expect(await queuedTexts(page, id), "entry kept").toContain(EXPECTED);
    expect(norm((await idbNote(page, id))?.content), "cached copy kept").toBe(EXPECTED);
    await expect(page.locator(`[data-note-card="${id}"]`)).toBeVisible();

    // Sync can't succeed (network down): only then "Sign out anyway" — a
    // second, explicit step. Cancel here keeps everything too.
    await clickSignOut(page);
    await expect(dialog).toContainText("Couldn’t sync 1 note", { timeout: 20_000 });
    await expect(dialog.getByRole("button", { name: "Sign out anyway (1 unsaved note will be lost)" })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    expect(await isSignedInCookie(page), "still signed in").toBe(true);
    expect(await queuedTexts(page, id), "entry kept").toContain(EXPECTED);

    // Network back: sign-out waits for the edit to land, then signs out and
    // clears that account's cloud data — and nothing else.
    await restore();
    await expectReload(page, () => clickSignOut(page));
    await expect(accountButton(page), "signed out").toBeHidden({ timeout: 20_000 });
    expect(await isSignedInCookie(page), "session cookie gone").toBe(false);
    expect(norm(await cloudServerContent(id)), "the edit landed before the sign-out").toBe(EXPECTED);
    expect(await queued(page, id), "account's entries cleared").toEqual([]);
    expect(await idbNote(page, id), "account's cached copy cleared").toBeNull();
    await expect(page.getByTestId("signed-out-notice")).toHaveCount(0);
    await expectGuestNoteKept(page, guest, "guest before sign-out");
  });

  test("(4) guest notes, unsynced edit included, survive both kinds of sign-out", async ({ page }) => {
    test.setTimeout(180_000);
    const guest = await guestThenSignIn(page, "guest note");
    const GUEST_UNSYNCED = "guest note edited offline";

    // A synced cloud note to switch to (closing the guest note's editor).
    await createCloudNote(page, "another note, synced");

    // A guest edit that hasn't reached the server: queued + cached unsynced.
    await page.locator(`[data-note-card="${guest.id}"]`).click();
    await expect(page.locator(EDITOR)).toContainText("guest note");
    await page.waitForTimeout(2000);
    const restore = await failServerActions(page.context());
    await unsyncedEdit(page, guest.id, " edited offline", GUEST_UNSYNCED);
    await closeNote(page, guest.id);

    // Involuntary sign-out (revoked session).
    await revokeSession(page);
    await expect(accountButton(page), "signed out").toBeHidden({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    expect(await queuedTexts(page, guest.id), "guest entry kept after the revoke").toContain(GUEST_UNSYNCED);
    const afterRevoke = await idbNote(page, guest.id);
    expect(norm(afterRevoke?.content), "guest copy kept after the revoke").toBe(GUEST_UNSYNCED);
    expect(afterRevoke?.localEdit).toBeTruthy();
    await expect(page.locator(`[data-note-card="${guest.id}"]`)).toBeVisible();

    // Sign back in (guest edit still unsynced: actions still failing at first).
    await signIn(page, acc);
    await page.reload();
    await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible({ timeout: 30_000 });
    await expect(accountButton(page)).toBeVisible();
    expect(await queuedTexts(page, guest.id), "guest entry kept across sign-in").toContain(GUEST_UNSYNCED);

    // User sign-out with nothing unsynced in the account: signs out at once
    // and clears only the account's cloud data. The guest edit is untouched.
    await expectReload(page, () => clickSignOut(page));
    await expect(accountButton(page), "signed out").toBeHidden({ timeout: 20_000 });
    expect(await isSignedInCookie(page)).toBe(false);
    await page.waitForTimeout(1500);
    expect(await queuedTexts(page, guest.id), "guest entry kept after the user sign-out").toContain(GUEST_UNSYNCED);
    const afterSignOut = await idbNote(page, guest.id);
    expect(norm(afterSignOut?.content), "guest copy kept after the user sign-out").toBe(GUEST_UNSYNCED);
    expect(afterSignOut?.localEdit).toBeTruthy();
    await expect(page.locator(`[data-note-card="${guest.id}"]`)).toBeVisible();

    // And it still reaches the server once the network is back.
    await restore();
    await page.reload();
    await expect.poll(async () => norm(await guestServerContent(redis, guest.anonId, guest.id)), { timeout: 20_000 }).toBe(GUEST_UNSYNCED);
    await expect.poll(() => queued(page, guest.id), { timeout: 10_000 }).toEqual([]);
  });
});
