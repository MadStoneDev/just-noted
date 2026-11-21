import type { Page, Route } from "@playwright/test";
import { test, expect } from "./fixtures/no-conflicts";
import Redis from "ioredis";
import { seededAccounts, signIn } from "./fixtures/auth";
import { adminClient } from "./fixtures/admin";

// Reproduction: sync interferes with typing in the open note.
//
// A background refresh's note-list fetch is slow (held 2.5s, as on a poor
// connection) while the user keeps typing (~15s, a realistic rhythm: steady
// keys, short word gaps, the odd 250ms pause, one "thinking" pause long enough
// for the 2s autosave to fire). Refreshes are triggered with focus events — the
// same refreshNotes path the poll, visibility change and cross-tab use.
//
// What must hold (the intended model):
//   - the text ends up EXACTLY as typed: in the editor, in this browser's
//     IndexedDB cache, and on the server;
//   - no "(conflicted copy)" is created: one person typing in one tab is not a
//     conflict, and our own save must never count as "server is newer".
//
// Saves are deliberately NOT throttled: a slow save keeps the note marked
// isSaving, which makes the app skip refreshes entirely and hides the race
// (seen while building this test: throttling every action let only one refresh
// through in 35s). A slow LIST fetch with normal saves is the case that breaks.
//
// Regression for: the refresh pushed the open note's IndexedDB write-ahead copy
// (a second writer), and the editor's next save then made a "(conflicted copy)".
// Fixed by one upload path per note (utils/note-ownership). Each run logs a
// request timeline (background pushes are tagged) plus editor remount /
// focus-loss counts.

const EDITOR = ".ProseMirror";
const THROTTLE_MS = 2500;

const WORDS = (
  "the quick brown fox jumps over the lazy dog while seven wizards quietly " +
  "pack boxes of liquor jugs and a sphinx of black quartz judges my vow " +
  "every morning the river carries small boats past the old mill"
).split(" ");
const EXPECTED_TAIL = WORDS.join(" ");

// Gap after each word: 90ms (below the editor's 200ms change debounce), every
// 4th word 250ms (the editor reports a change), and one 2.3s pause after word
// 10 (the 2s autosave fires while typing then resumes).
const gapAfter = (i: number) => (i === 9 ? 2300 : i % 4 === 3 ? 250 : 90);

// The note-list fetches a refresh makes: Redis getAll, and the Supabase list
// (a server action with no arguments).
const isListFetch = (body: string) => body.includes('"operation":"getAll"') || body.trim() === "[]";

/** Hold list fetches THROTTLE_MS; log every server action (pushes tagged). */
async function throttleListFetches(page: Page, log: string[], t0: () => number) {
  let on = false;
  const stats = { listFetches: 0 };
  await page.route("**/*", async (route: Route) => {
    const req = route.request();
    const body = req.postData() ?? "";
    const isAction = req.method() === "POST" && !!req.headers()["next-action"];
    if (on && isAction) {
      const op = body.match(/"operation":"(\w+)"/)?.[1] ?? (isListFetch(body) ? "list" : "save");
      const base = body.match(/"baseVersion":(\d+)/)?.[1];
      const push = body.includes("conflictCopy") ? " [BACKGROUND PUSH]" : "";
      if (isListFetch(body)) {
        stats.listFetches++;
        log.push(`${t0()}ms  → ${op} (held ${THROTTLE_MS}ms)`);
        await new Promise((r) => setTimeout(r, THROTTLE_MS));
        await route.continue();
        log.push(`${t0()}ms  ↳ ${op} sent`);
        return;
      }
      log.push(`${t0()}ms  · ${op}${push}${base ? ` base=${base}` : ""}`);
    }
    await route.continue();
  });
  return {
    stats,
    start() { on = true; },
    async stop() { on = false; await page.unroute("**/*"); },
  };
}

/** Count editor (re)mounts and focus losses. */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__race = { mounts: 0, blurs: 0 };
    const seen = new WeakSet<Element>();
    new MutationObserver(() => {
      document.querySelectorAll(".ProseMirror").forEach((el) => {
        if (!seen.has(el)) { seen.add(el); w.__race.mounts++; }
      });
    }).observe(document, { childList: true, subtree: true });
    document.addEventListener("focusout", (e) => {
      if ((e.target as Element | null)?.closest?.(".ProseMirror")) w.__race.blurs++;
    }, true);
  });
}

async function idbContent(page: Page, noteId: string): Promise<string | null> {
  return page.evaluate((id) => new Promise<string | null>((resolve) => {
    const req = indexedDB.open("NotesCacheDB");
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      const get = db.transaction("notes", "readonly").objectStore("notes").get(id);
      get.onsuccess = () => { resolve(get.result?.content ?? null); db.close(); };
      get.onerror = () => { resolve(null); db.close(); };
    };
  }), noteId);
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const activeId = (page: Page) => page.evaluate(() =>
  document.querySelector('[data-note-card][data-active="true"]')?.getAttribute("data-note-card") ?? null);
const editorFocused = (page: Page) => page.evaluate(() => !!document.activeElement?.closest(".ProseMirror"));

interface ServerView {
  content: () => Promise<string | null>;
  conflictedCopies: () => Promise<number>;
}

async function typeDuringSync(page: Page, noteId: string, server: ServerView) {
  const startedAt = Date.now();
  const t0 = () => Date.now() - startedAt;
  const log: string[] = [];
  const throttle = await throttleListFetches(page, log, t0);

  // Baseline: a first save has landed, so the note has a server version.
  await page.keyboard.type("start ", { delay: 40 });
  await expect.poll(async () => norm(await server.content()), { timeout: 15_000 }).toBe("start");
  await page.waitForTimeout(500);
  const copiesBefore = await server.conflictedCopies();
  const mountsBefore = await page.evaluate(() => (window as any).__race.mounts);
  const blursBefore = await page.evaluate(() => (window as any).__race.blurs);
  throttle.start();

  let typing = true;
  const refreshTriggers = (async () => {
    while (typing) {
      await page.evaluate(() => window.dispatchEvent(new Event("focus"))).catch(() => {});
      await page.waitForTimeout(1000);
    }
  })();
  for (let i = 0; i < WORDS.length; i++) {
    await page.keyboard.type(WORDS[i] + " ", { delay: 45 });
    await page.waitForTimeout(gapAfter(i));
  }
  typing = false;
  await refreshTriggers;
  const typingMs = t0();
  const refreshesDuringTyping = throttle.stats.listFetches;

  // Let in-flight work finish, stop throttling, and give the last save time to land.
  await page.waitForTimeout(THROTTLE_MS * 2);
  await throttle.stop();
  const expected = norm("start " + EXPECTED_TAIL);
  await expect.poll(async () => norm(await server.content()), { timeout: 20_000 }).toBe(expected).catch(() => {});
  await page.waitForTimeout(1500); // the conflict path's follow-up refresh

  const race = await page.evaluate(() => (window as any).__race);
  const result = {
    typingMs,
    refreshesDuringTyping,
    conflictedCopiesCreated: (await server.conflictedCopies()) - copiesBefore,
    editorRemounts: race.mounts - mountsBefore,
    editorFocusLosses: race.blurs - blursBefore,
    editor: norm(await page.locator(EDITOR).first().innerText()),
    idb: norm(await idbContent(page, noteId)),
    server: norm(await server.content()),
    expected,
  };
  console.log(`[typing-race] ${JSON.stringify(result, null, 2)}\n[typing-race] timeline:\n${log.join("\n")}`);

  // Not a valid run unless at least one refresh actually overlapped the typing.
  test.skip(refreshesDuringTyping === 0, "no refresh overlapped the typing — scenario not exercised");

  expect(result.editor, "editor text").toBe(expected);
  expect(result.idb, "IndexedDB text").toBe(expected);
  expect(result.server, "server text").toBe(expected);
  expect(result.conflictedCopiesCreated, "conflicted copies created by one tab typing").toBe(0);
}

test.describe("typing during sync keeps every word, with no conflicted copies", () => {
  test("local (guest) note", async ({ page }) => {
    test.setTimeout(120_000);
    await instrument(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
    await page.getByRole("main", { name: "Note editor" }).getByRole("button", { name: "New note" }).click();
    await expect(page.locator(EDITOR).first()).toBeVisible();
    await expect.poll(() => editorFocused(page)).toBe(true);
    await expect.poll(() => activeId(page)).not.toBeNull();
    const noteId = (await activeId(page))!;
    const anonId = await page.evaluate(() => localStorage.getItem("notes_user_id"));

    const redis = new Redis(process.env.VALKEY_URL || "redis://127.0.0.1:6380", { keyPrefix: "justnoted:" });
    try {
      await typeDuringSync(page, noteId, {
        content: async () => {
          const raw = await redis.hget(`notes:${anonId}`, noteId);
          return raw ? (JSON.parse(raw).content as string) : null;
        },
        conflictedCopies: async () =>
          Object.values(await redis.hgetall(`notes:${anonId}`))
            .filter((r) => String(JSON.parse(r).title ?? "").includes("(conflicted copy")).length,
      });
    } finally {
      redis.disconnect();
    }
  });

  test.describe("signed-in", () => {
    test.skip(seededAccounts().length < 1, "needs seeded accounts (service-role key)");

    test("cloud note", async ({ page }) => {
        test.setTimeout(120_000);
      await instrument(page);
      const [acc] = seededAccounts();
      await signIn(page, acc);
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
      await expect(page.locator("[data-note-card]").first()).toBeVisible(); // initial load landed
      await page.waitForTimeout(1000);
      const before = await activeId(page);
      await page.locator("body").press("Control+j");
      await expect.poll(() => activeId(page)).not.toBe(before);
      await expect.poll(() => editorFocused(page)).toBe(true);
      const noteId = (await activeId(page))!;

      await typeDuringSync(page, noteId, {
        content: async () => {
          const { data } = await adminClient().from("notes").select("content").eq("id", noteId).maybeSingle();
          return (data as { content: string } | null)?.content ?? null;
        },
        conflictedCopies: async () => {
          const { count } = await adminClient().from("notes").select("id", { count: "exact", head: true })
            .eq("author", acc.id).ilike("title", "%conflicted copy%").is("deleted_at", null);
          return count ?? 0;
        },
      });
    });
  });
});

// Regression (was also on origin/main, live in production): reopen the app on
// a slow link and keep writing in a note before the first sync finishes. After
// a save lands, the IndexedDB cache still holds the PREVIOUS version, so the
// cache-painted editor pins a stale base; once the 5s hydration lock releases
// the user types, and that save is CAS'd against the stale base. The server
// sees a newer version (our own earlier save) and keeps "(conflicted copy)" of
// our own earlier text. Same tab, same person — not a conflict. Fixed by
// keeping the cache's version in step and by moving the editor's base forward
// when the server's newer version holds exactly the text it started from.
test.describe("reopening on a slow link", () => {
  test.skip(seededAccounts().length < 1, "needs seeded accounts (service-role key)");

  test("cloud note: typing during the first sync makes no conflicted copy", async ({ page }) => {
    test.setTimeout(120_000);
    const LATENCY_MS = 2000; // keeps the first sync running past the 5s lock release
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
    const noteId = (await activeId(page))!;
    const row = async () => {
      const { data } = await adminClient().from("notes").select("content, version").eq("id", noteId).maybeSingle();
      return data as { content: string; version: number } | null;
    };
    await page.keyboard.type("alpha bravo ", { delay: 40 });
    await expect.poll(async () => norm((await row())?.content), { timeout: 15_000 }).toBe("alpha bravo");
    await page.keyboard.type("charlie ", { delay: 40 });
    await expect.poll(async () => norm((await row())?.content), { timeout: 15_000 }).toBe("alpha bravo charlie");
    // The cache now lags the server by one version.
    const cachedVersion = await page.evaluate((id) => new Promise<number | null>((res) => {
      const r = indexedDB.open("NotesCacheDB");
      r.onsuccess = () => { const g = r.result.transaction("notes").objectStore("notes").get(id); g.onsuccess = () => res(g.result?.version ?? null); };
    }), noteId);
    console.log(`[reopen-race] server v${(await row())?.version}, IndexedDB v${cachedVersion}`);

    await page.route("**/*", async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"]) await new Promise((r) => setTimeout(r, LATENCY_MS));
      return route.continue().catch(() => {});
    });
    await page.reload();
    const card = page.locator(`[data-note-card="${noteId}"]`);
    await expect(card).toBeVisible({ timeout: 30_000 }); // painted from the cache
    await card.click();
    await page.waitForTimeout(5500); // the hydration lock releases; the first sync is still running
    await page.locator(EDITOR).first().click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" delta echo", { delay: 60 });
    const expected = "alpha bravo charlie delta echo";
    await expect.poll(async () => norm((await row())?.content), { timeout: 45_000 }).toBe(expected);
    await page.waitForTimeout(3000);

    expect(norm(await page.locator(EDITOR).first().innerText()), "editor text").toBe(expected);
    expect(norm(await idbContent(page, noteId)), "IndexedDB text").toBe(expected);
    // The no-conflicted-copies fixture fails this test if the save made a copy.
  });
});

// Two tabs, one note. Only the tab holding the note's edit lock writes; the
// other shows it read-only and follows along, and takes over when the first
// tab closes. Nothing typed in the read-only tab goes anywhere, nothing typed in
// the owning tab is lost, and no conflicted copy is made.
async function twoTabs(
  context: import("@playwright/test").BrowserContext,
  a: Page,
  noteId: string,
  serverContent: () => Promise<string | null>,
) {
  await a.keyboard.type("alpha bravo ", { delay: 40 });
  await expect.poll(async () => norm(await serverContent()), { timeout: 15_000 }).toBe("alpha bravo");

  const b = await context.newPage();
  await b.goto("/");
  await expect(b.getByRole("heading", { name: "All Notes" })).toBeVisible();
  await b.locator(`[data-note-card="${noteId}"]`).click();
  await expect(b.locator(EDITOR).first()).toContainText("alpha bravo");
  await expect(b.getByText("Editing in another tab")).toBeVisible();

  // Both tabs type at once. A owns the note; B is read-only.
  await a.bringToFront();
  const typingA = a.keyboard.type("charlie delta ", { delay: 50 });
  await b.locator(EDITOR).first().click({ force: true }).catch(() => {});
  await b.keyboard.type("IGNORED", { delay: 30 });
  await typingA;
  await expect.poll(async () => norm(await serverContent()), { timeout: 15_000 }).toBe("alpha bravo charlie delta");
  await expect.poll(async () => norm(await b.locator(EDITOR).first().innerText()), { timeout: 15_000 })
    .toBe("alpha bravo charlie delta"); // B followed A, and kept none of its own keys

  // A closes; B takes over and writes.
  await a.close({ runBeforeUnload: true });
  await expect(b.getByText("Editing in another tab")).toHaveCount(0, { timeout: 15_000 });
  await b.bringToFront();
  await b.locator(EDITOR).first().click();
  await b.keyboard.press("Control+End");
  await b.keyboard.type(" echo foxtrot", { delay: 40 });
  const expected = "alpha bravo charlie delta echo foxtrot";
  await expect.poll(async () => norm(await serverContent()), { timeout: 15_000 }).toBe(expected);
  await b.waitForTimeout(1500);
  expect(norm(await b.locator(EDITOR).first().innerText()), "editor text in the tab that took over").toBe(expected);
  expect(norm(await idbContent(b, noteId)), "IndexedDB text").toBe(expected);
  // The no-conflicted-copies fixture checks that no copy was made.
}

test.describe("two tabs with the same note open", () => {
  test("local (guest) note: one writer at a time, no conflicted copies", async ({ page, context }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
    await page.getByRole("main", { name: "Note editor" }).getByRole("button", { name: "New note" }).click();
    await expect(page.locator(EDITOR).first()).toBeVisible();
    await expect.poll(() => editorFocused(page)).toBe(true);
    await expect.poll(() => activeId(page)).not.toBeNull();
    const noteId = (await activeId(page))!;
    const anonId = await page.evaluate(() => localStorage.getItem("notes_user_id"));
    const redis = new Redis(process.env.VALKEY_URL || "redis://127.0.0.1:6380", { keyPrefix: "justnoted:" });
    try {
      await twoTabs(context, page, noteId, async () => {
        const raw = await redis.hget(`notes:${anonId}`, noteId);
        return raw ? (JSON.parse(raw).content as string) : null;
      });
    } finally {
      redis.disconnect();
    }
  });

  test.describe("signed-in", () => {
    test.skip(seededAccounts().length < 1, "needs seeded accounts (service-role key)");

    test("cloud note: one writer at a time, no conflicted copies", async ({ page, context }) => {
      test.setTimeout(120_000);
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
      const noteId = (await activeId(page))!;
      await twoTabs(context, page, noteId, async () => {
        const { data } = await adminClient().from("notes").select("content").eq("id", noteId).maybeSingle();
        return (data as { content: string } | null)?.content ?? null;
      });
    });
  });
});

// Two devices: a note edited on one device must not become a "(conflicted
// copy)" when the other device — whose cache just holds an older, already
// synced copy — opens the app again. A stale cache is not an unsynced edit.
test.describe("another device edited the note", () => {
  test.skip(seededAccounts().length < 1, "needs seeded accounts (service-role key)");

  test("cloud note: reopening with an older cached copy makes no conflicted copy", async ({ browser, page, trackContext }) => {
    test.setTimeout(120_000);
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
    const noteId = (await activeId(page))!;
    const row = async () => {
      const { data } = await adminClient().from("notes").select("content, version").eq("id", noteId).maybeSingle();
      return data as { content: string; version: number } | null;
    };
    await page.keyboard.type("written on device one", { delay: 30 });
    await expect.poll(async () => norm((await row())?.content), { timeout: 15_000 }).toBe("written on device one");
    await page.waitForTimeout(1000);
    console.log(`[two-device] device one cached v${await page.evaluate((id) => new Promise<number | null>((res) => {
      const r = indexedDB.open("NotesCacheDB");
      r.onsuccess = () => { const g = r.result.transaction("notes").objectStore("notes").get(id); g.onsuccess = () => res(g.result?.version ?? null); };
    }), noteId)}, server v${(await row())?.version}`);
    // Device one goes away with the note in its cache (closing the note first).
    await page.locator("body").press("Control+j");
    await page.waitForTimeout(1500);
    await page.goto("about:blank");

    // Device two (its own browser profile) edits the same note.
    const other = await browser.newContext();
    trackContext(other);
    try {
      await signIn(other, acc);
      const two = await other.newPage();
      await two.goto("/");
      await expect(two.getByRole("heading", { name: "All Notes" })).toBeVisible();
      await two.locator(`[data-note-card="${noteId}"]`).click();
      await expect(two.locator(EDITOR).first()).toContainText("written on device one");
      await two.locator(EDITOR).first().click();
      await two.keyboard.press("Control+End");
      await two.keyboard.type(" then edited on device two", { delay: 30 });
      await expect.poll(async () => norm((await row())?.content), { timeout: 15_000 })
        .toBe("written on device one then edited on device two");
      await two.waitForTimeout(1000);
    } finally {
      await other.close();
    }

    // Device one opens the app again: its cache is older than the server.
    const pushes: string[] = [];
    page.on("request", (req) => {
      const b = req.postData() ?? "";
      if (req.method() === "POST" && req.headers()["next-action"] && b.includes("conflictCopy")) {
        pushes.push(`background push base=${b.match(/"baseVersion":(\d+)/)?.[1]} ${b.includes(noteId) ? "(this note)" : "(other note)"}`);
      }
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
    // Leave the note closed while the startup reconcile runs (an open note is
    // its editor's, and is skipped) — that is the case that made copies.
    await page.waitForTimeout(5000);
    await page.locator(`[data-note-card="${noteId}"]`).click();
    await expect(page.locator(EDITOR).first()).toContainText("then edited on device two", { timeout: 20_000 });
    await page.waitForTimeout(2000);
    console.log(`[two-device] server v${(await row())?.version}; background pushes from device one: ${JSON.stringify(pushes)}`);
    expect(norm((await row())?.content)).toBe("written on device one then edited on device two");
    // The no-conflicted-copies fixture fails this test if a copy was made.
  });
});
