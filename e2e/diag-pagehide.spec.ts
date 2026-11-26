import fs from "node:fs";
import path from "node:path";
import Redis from "ioredis";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { test, expect } from "./fixtures/no-conflicts";
import { seededAccounts, signIn } from "./fixtures/auth";
import { adminClient, hasAdminEnv } from "./fixtures/admin";
import { e2eFileEnv } from "./fixtures/env";

// DIAGNOSTIC ONLY (docs/tickets/flaky-pagehide-second-tab-e2e.md). Skipped
// unless E2E_DIAG=1, so the normal suite never runs it.
//
// Instruments the "text typed just before closing the tab is kept (pagehide,
// second tab)" flow, plus the real-world "type, close within 0.5s" case for a
// guest and a cloud note. Every run writes a timeline (network, console, the
// server copy in Valkey / Supabase, and the surviving tab's IndexedDB queue,
// cache and Web Locks) to the test's output folder, and one JSON summary line
// per run to $E2E_DIAG_OUT/summary.jsonl.
//
//   E2E_DIAG=1            enable
//   E2E_DIAG_CPU=<rate>   Chromium CPU throttling on every app page (e.g. 4)
//   E2E_DIAG_OUT=<dir>    where summary.jsonl goes (default test-results/diag)
//   E2E_DIAG_REPEAT=<n>   declare each spec n times (to repeat them inside a
//                         full-suite run, where --repeat-each would repeat all)
//
// Persistent contexts also write a Chromium net log (netlog*.json, in the test
// output folder): it records requests the network service sent after the page
// was gone (Playwright's request events stop at page close).

const ON = process.env.E2E_DIAG === "1";
const CPU = Number(process.env.E2E_DIAG_CPU || 0);
const REPEAT = Math.max(1, Number(process.env.E2E_DIAG_REPEAT || 1));
const OUT = process.env.E2E_DIAG_OUT || path.resolve(__dirname, "../test-results/diag");

const EDITOR = ".ProseMirror";
const editor = (p: Page) => p.locator(EDITOR).first();
const waitForApp = (p: Page) => expect(p.getByRole("heading", { name: "All Notes" })).toBeVisible();

async function activeCardId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.querySelector('[data-note-card][data-active="true"]')?.getAttribute("data-note-card") ?? null,
  );
}

// ── Instrumentation ─────────────────────────────────────────────────────────

class Timeline {
  t0 = Date.now();
  lines: string[] = [];
  marker = "";
  ev(s: string) {
    const line = `${String(Date.now() - this.t0).padStart(7)}ms ${s}`;
    this.lines.push(line);
  }
}

function watchContext(ctx: BrowserContext, tl: Timeline, labels: Map<Page, string>) {
  const label = (p: Page | null) => (p ? labels.get(p) ?? "?" : "sw/none");
  const attach = (p: Page) => {
    p.on("console", (m) => tl.ev(`[${label(p)}] console.${m.type()}: ${m.text().slice(0, 300)}`));
    p.on("pageerror", (e) => tl.ev(`[${label(p)}] pageerror: ${String(e).slice(0, 300)}`));
    p.on("close", () => tl.ev(`[${label(p)}] page closed`));
  };
  ctx.pages().forEach(attach);
  ctx.on("page", attach);
  const describe = (r: import("@playwright/test").Request) => {
    const action = r.headers()["next-action"];
    const body = r.postData() ?? "";
    const op = body.match(/"operation":"(\w+)"/)?.[1];
    const has = tl.marker && body.includes(tl.marker) ? " CARRIES-MARKER" : "";
    let page: Page | null = null;
    try {
      page = r.frame().page();
    } catch {}
    return `[${label(page)}] ${r.method()} ${new URL(r.url()).pathname}${action ? ` action=${action.slice(0, 8)}` : ""}${op ? ` op=${op}` : ""}${has} body=${JSON.stringify(body.slice(0, 160))}`;
  };
  ctx.on("request", (r) => {
    if (r.method() === "GET" && !r.url().includes("/api/")) return; // skip asset noise
    tl.ev(`→ ${describe(r)}`);
  });
  ctx.on("requestfinished", async (r) => {
    if (r.method() === "GET" && !r.url().includes("/api/")) return;
    const res = await r.response().catch(() => null);
    tl.ev(`← ${res?.status() ?? "?"} ${describe(r)}`);
  });
  ctx.on("requestfailed", (r) => tl.ev(`✗ FAILED (${r.failure()?.errorText}) ${describe(r)}`));
}

async function throttle(ctx: BrowserContext, page: Page) {
  if (!CPU) return;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
}

/** Tab-side state for one note: IDB queue entries, IDB cache record, Web Locks, editor. */
async function tabState(page: Page, noteId: string, marker: string) {
  return page
    .evaluate(
      async ({ noteId, marker }) => {
        const open = (name: string) =>
          new Promise<IDBDatabase>((res, rej) => {
            const r = indexedDB.open(name);
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          });
        const all = (db: IDBDatabase, store: string) =>
          new Promise<any[]>((res) => {
            try {
              const q = db.transaction(store, "readonly").objectStore(store).getAll();
              q.onsuccess = () => res(q.result);
              q.onerror = () => res([]);
            } catch {
              res([]);
            }
          });
        const out: Record<string, unknown> = {};
        try {
          const q = await open("OfflineQueueDB");
          const ops = (await all(q, "operations")).filter((o) => o.payload?.noteId === noteId);
          out.queue = ops.map((o) => ({
            type: o.payload.type,
            hasMarker: JSON.stringify(o.payload).includes(marker),
            baseVersion: o.payload.baseVersion,
            retry: o.retryCount,
            origin: String(o.origin ?? "").slice(0, 8),
          }));
          q.close();
        } catch (e) {
          out.queue = `ERR ${e}`;
        }
        try {
          const c = await open("NotesCacheDB");
          const rec = (await all(c, "notes")).find((n) => n.id === noteId);
          out.cache = rec
            ? { hasMarker: String(rec.content ?? "").includes(marker), localEdit: rec.localEdit, version: rec.version }
            : null;
          c.close();
        } catch (e) {
          out.cache = `ERR ${e}`;
        }
        try {
          const l = await (navigator as any).locks.query();
          const f = (xs: any[]) => xs.filter((x) => x.name?.includes(noteId)).map((x) => x.clientId?.slice(0, 8));
          out.locks = { held: f(l.held ?? []), pending: f(l.pending ?? []) };
        } catch {}
        const card = document.querySelector(`[data-note-card="${noteId}"]`);
        out.cardHasMarker = !!card?.textContent?.includes(marker);
        const pm = document.querySelector(".ProseMirror");
        const activeId = document.querySelector('[data-note-card][data-active="true"]')?.getAttribute("data-note-card");
        out.editor = pm
          ? {
              openNote: activeId === noteId ? "this" : activeId ? "other" : "none",
              hasMarker: !!pm.textContent?.includes(marker),
              editable: pm.getAttribute("contenteditable"),
            }
          : null;
        out.elsewhereBanner = /another tab|elsewhere/i.test(document.getElementById("main-content")?.textContent ?? "");
        return out;
      },
      { noteId, marker },
    )
    .catch((e) => ({ error: String(e) }));
}

function valkey() {
  return new Redis(e2eFileEnv().VALKEY_URL || process.env.VALKEY_URL || "redis://127.0.0.1:6380", {
    keyPrefix: "justnoted:",
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
}

/** Poll the server copy and log each change in whether it carries the marker. */
function watchServer(tl: Timeline, read: () => Promise<string | null>, everyMs = 100) {
  let last: string | undefined;
  let landedAt: number | null = null;
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      let s: string;
      try {
        const c = await read();
        s = c === null ? "missing" : c.includes(tl.marker) && tl.marker ? "HAS-MARKER" : `no-marker(${JSON.stringify(c.slice(0, 40))})`;
      } catch (e) {
        s = `read-error ${e}`;
      }
      if (s !== last) {
        tl.ev(`[server] note ${s}`);
        if (s === "HAS-MARKER" && landedAt === null) landedAt = Date.now() - tl.t0;
        last = s;
      }
      await new Promise((r) => setTimeout(r, everyMs));
    }
  })();
  return {
    landedAt: () => landedAt,
    stop: async () => {
      stopped = true;
      await loop;
    },
  };
}

function writeSummary(row: Record<string, unknown>) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.appendFileSync(path.join(OUT, "summary.jsonl"), JSON.stringify(row) + "\n");
}

async function finish(testInfo: import("@playwright/test").TestInfo, tl: Timeline, row: Record<string, unknown>) {
  const file = testInfo.outputPath("timeline.txt");
  fs.writeFileSync(file, tl.lines.join("\n") + "\n");
  await testInfo.attach("timeline", { path: file, contentType: "text/plain" });
  writeSummary({ ...row, test: testInfo.title, repeat: testInfo.repeatEachIndex, cpu: CPU, timeline: file });
}

async function launch(
  testInfo: import("@playwright/test").TestInfo,
  userDataDir: string,
  baseURL: string | undefined,
  tag: string,
  tl?: Timeline,
) {
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    baseURL,
    args: [`--log-net-log=${testInfo.outputPath(`netlog-${tag}.json`)}`, "--net-log-capture-mode=Everything"],
  });
  if (tl) await probe(ctx, tl);
  return ctx;
}

// What the closing page actually got done. An init script reports, over a
// BroadcastChannel, pagehide plus every IDB readwrite transaction's
// complete/abort (with whether it touched text containing "e2e-") and every
// fetch carrying it. The listener is a non-app page on the same origin
// (/api/version, plain JSON), so it adds no app tab, lock or refresh.
async function probe(ctx: BrowserContext, tl: Timeline) {
  await ctx.addInitScript(() => {
    if ((window as any).__probe) return;
    (window as any).__probe = true;
    const ch = new BroadcastChannel("e2e-probe");
    const tab = Math.random().toString(36).slice(2, 6);
    const say = (m: string) => {
      try {
        ch.postMessage(`${tab} ${m}`);
      } catch {}
    };
    const marked = (v: unknown) => {
      try {
        return /e2e-(close|rw)-/.test(typeof v === "string" ? v : JSON.stringify(v));
      } catch {
        return false;
      }
    };
    addEventListener("pagehide", () => say("pagehide"));
    document.addEventListener("visibilitychange", () => say(`visibility=${document.visibilityState}`));
    const txInfo = new WeakMap<IDBTransaction, { db: string; marked: boolean; ops: string[] }>();
    const origTx = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: any[]) {
      const tx = (origTx as any).apply(this, args) as IDBTransaction;
      if (args[1] === "readwrite") {
        const info = { db: this.name, marked: false, ops: [] as string[] };
        txInfo.set(tx, info);
        tx.addEventListener("complete", () => info.marked && say(`idb COMPLETE ${info.db} [${info.ops}]`));
        tx.addEventListener("abort", () => info.marked && say(`idb ABORT ${info.db} [${info.ops}]`));
      }
      return tx;
    } as any;
    const origPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: any, ...rest: any[]) {
      const info = txInfo.get(this.transaction);
      if (info && marked(value)) {
        info.marked = true;
        info.ops.push(`put:${this.name}`);
        say(`idb put ${info.db}/${this.name}`);
      }
      return (origPut as any).call(this, value, ...rest);
    } as any;
    const origFetch = window.fetch;
    window.fetch = function (this: any, input: any, init?: any) {
      if (init?.body && marked(init.body)) {
        const url = typeof input === "string" ? input : input?.url;
        say(`fetch ${url} keepalive=${!!init.keepalive}`);
      }
      return origFetch.call(this, input, init);
    } as any;
    const origBeacon = navigator.sendBeacon?.bind(navigator);
    if (origBeacon) {
      navigator.sendBeacon = (url: string, data?: any) => {
        if (marked(data)) say(`beacon ${url}`);
        return origBeacon(url, data);
      };
    }
  });
  const listener = await ctx.newPage();
  await listener.goto("/api/version");
  await listener.exposeFunction("__e2eProbe", (m: string) => tl.ev(`[probe] ${m}`));
  await listener.evaluate(() => {
    new BroadcastChannel("e2e-probe").onmessage = (e) => (window as any).__e2eProbe(String(e.data));
  });
}

/** Lose the close-time network saves: abort this page's requests carrying the
 *  marker, and drop the keepalive leave-save at the server (test hook). */
async function dropMarkerSaves(page: Page, tl: Timeline, row: Record<string, unknown>) {
  row.dropped = 0;
  // The keepalive leave-save too (server test hook, E2E_TEST_HOOKS=1).
  await page.context().addCookies([
    { name: "e2e_drop_leave_save", value: "1", url: process.env.E2E_BASE_URL || "http://localhost:3050" },
  ]);
  await page.route("**/*", (route) => {
    const r = route.request();
    if (r.method() === "POST" && tl.marker && (r.postData() ?? "").includes(tl.marker)) {
      row.dropped = (row.dropped as number) + 1;
      tl.ev(`DROPPED ${new URL(r.url()).pathname} ${r.headers()["next-action"]?.slice(0, 8) ?? ""}`);
      return route.abort();
    }
    return route.fallback();
  });
}

// ── Specs ───────────────────────────────────────────────────────────────────

test.describe("DIAG pagehide", () => {
  test.skip(!ON, "diagnostic — set E2E_DIAG=1");
  for (let rep = 0; rep < REPEAT; rep++) {
  for (const drop of [false, true]) {
  const n = (drop ? " [save dropped]" : "") + (REPEAT > 1 ? ` #${rep + 1}` : "");

  // Same steps as core-flows "pagehide, second tab", but nothing short-circuits:
  // every checkpoint is recorded, and the observation continues 30s past the
  // original 20s window to see whether (and how) the text ever shows up.
  test(`replica: second tab after pagehide close (guest)${n}`, async ({ baseURL, trackContext }, testInfo) => {
    test.setTimeout(240_000);
    const tl = new Timeline();
    const labels = new Map<Page, string>();
    const userDataDir = testInfo.outputPath("profile");
    let ctx = await launch(testInfo, userDataDir, baseURL, "1", tl);
    trackContext(ctx);
    watchContext(ctx, tl, labels);
    const redis = valkey();
    const row: Record<string, unknown> = { kind: "replica-guest", drop };
    let server: ReturnType<typeof watchServer> | null = null;
    try {
      await ctx.addInitScript(() => {
        window.addEventListener("pagehide", () => new BroadcastChannel("e2e").postMessage("pagehide"));
      });
      const page = await ctx.newPage();
      labels.set(page, "tab1");
      await throttle(ctx, page);
      await page.goto("/");
      await waitForApp(page);
      await page.getByRole("main", { name: "Note editor" }).getByRole("button", { name: "New note" }).click();
      await expect(editor(page)).toBeVisible();
      const id = (await activeCardId(page))!;
      const anon = await page.evaluate(() => localStorage.getItem("notes_user_id"));
      row.noteId = id;
      tl.ev(`created note ${id} anon=${anon}`);
      await page.waitForTimeout(2500);

      const other = await ctx.newPage();
      labels.set(other, "tab2");
      await throttle(ctx, other);
      tl.ev("tab2 goto");
      await other.goto("/");
      await waitForApp(other);
      const otherCard = other.locator(`[data-note-card="${id}"]`);
      await expect(otherCard).toBeVisible();
      tl.ev(`tab2 loaded; state=${JSON.stringify(await tabState(other, id, "\u0000"))}`);
      const heard = other.evaluate(
        () =>
          new Promise<string>((resolve) => {
            const ch = new BroadcastChannel("e2e");
            ch.onmessage = (e) => resolve(String(e.data));
          }),
      );

      const marker = `e2e-close-${Date.now()}`;
      tl.marker = marker;
      if (drop) await dropMarkerSaves(page, tl, row);
      server = watchServer(tl, () => redis.hget(`notes:${anon}`, id));
      await page.bringToFront();
      await editor(page).click();
      tl.ev("tab1 typing");
      await page.keyboard.type(marker);
      tl.ev("tab1 close(runBeforeUnload)");
      await page.close({ runBeforeUnload: true });
      row.heard = await heard;
      tl.ev(`tab2 heard ${row.heard}; state=${JSON.stringify(await tabState(other, id, marker))}`);

      await other.bringToFront();
      tl.ev(`tab2 bringToFront; state=${JSON.stringify(await tabState(other, id, marker))}`);
      await other.waitForTimeout(5500);
      tl.ev(`tab2 before focus; state=${JSON.stringify(await tabState(other, id, marker))}`);
      const focusAt = Date.now() - tl.t0;
      await other.evaluate(() => window.dispatchEvent(new Event("focus")));
      tl.ev("tab2 focus dispatched");

      // Original window: 20s. Then 30s more, sampling.
      let shownAt: number | null = null;
      const deadline = Date.now() + 50_000;
      let sample = 0;
      while (Date.now() < deadline) {
        if (await otherCard.textContent().then((t) => !!t?.includes(marker)).catch(() => false)) {
          shownAt = Date.now() - tl.t0;
          break;
        }
        if (++sample % 10 === 0) tl.ev(`tab2 sample; state=${JSON.stringify(await tabState(other, id, marker))}`);
        await other.waitForTimeout(200);
      }
      row.case1ShownAfterFocusMs = shownAt === null ? null : shownAt - focusAt;
      row.case1Pass = shownAt !== null && shownAt - focusAt <= 20_000;
      tl.ev(`case1 shownAfterFocus=${row.case1ShownAfterFocusMs}; state=${JSON.stringify(await tabState(other, id, marker))}`);

      await other.waitForTimeout(3000);
      await other.reload();
      await waitForApp(other);
      const reloadOk = await expect(other.locator(`[data-note-card="${id}"]`))
        .toContainText(marker, { timeout: 20_000 })
        .then(() => true, () => false);
      row.reloadPass = reloadOk;
      tl.ev(`after reload pass=${reloadOk}; state=${JSON.stringify(await tabState(other, id, marker))}`);
      await ctx.close();

      ctx = await launch(testInfo, userDataDir, baseURL, "restart");
      trackContext(ctx);
      watchContext(ctx, tl, labels);
      const reopened = ctx.pages()[0] ?? (await ctx.newPage());
      labels.set(reopened, "restart");
      await reopened.goto("/");
      await waitForApp(reopened);
      row.restartPass = await expect(reopened.locator(`[data-note-card="${id}"]`))
        .toContainText(marker, { timeout: 20_000 })
        .then(() => true, () => false);
      tl.ev(`after restart pass=${row.restartPass}`);
    } finally {
      await server?.stop();
      row.serverLandedAtMs = server?.landedAt() ?? null;
      await ctx.close().catch(() => {});
      redis.disconnect();
      await finish(testInfo, tl, row);
    }
    expect(row.case1Pass, "case 1 (focus refresh shows marker within 20s)").toBe(true);
    expect(row.reloadPass, "reload").toBe(true);
    expect(row.restartPass, "restart").toBe(true);
  });

  // Real world, guest: type, close within 0.5s, no other tab open. Then:
  // does the SERVER have it (= another device)? Then a new tab in the same
  // browser, and finally a fresh browser with the same guest id ("another
  // device" holding this guest identity, e.g. after a recovery).
  test(`real-world: guest note, close within 0.5s${n}`, async ({ baseURL, browser, trackContext }, testInfo) => {
    test.setTimeout(180_000);
    const tl = new Timeline();
    const labels = new Map<Page, string>();
    const userDataDir = testInfo.outputPath("profile");
    const ctx = await launch(testInfo, userDataDir, baseURL, "1", tl);
    trackContext(ctx);
    watchContext(ctx, tl, labels);
    const redis = valkey();
    const closeDelay = Math.floor(Math.random() * 500);
    const row: Record<string, unknown> = { kind: "guest-close", drop, closeDelay };
    let server: ReturnType<typeof watchServer> | null = null;
    let device2: BrowserContext | null = null;
    try {
      const page = await ctx.newPage();
      labels.set(page, "tab1");
      await throttle(ctx, page);
      await page.goto("/");
      await waitForApp(page);
      await page.getByRole("main", { name: "Note editor" }).getByRole("button", { name: "New note" }).click();
      await expect(editor(page)).toBeVisible();
      const id = (await activeCardId(page))!;
      const anon = (await page.evaluate(() => localStorage.getItem("notes_user_id")))!;
      row.noteId = id;
      await page.waitForTimeout(2500);

      const marker = `e2e-rw-guest-${Date.now()}`;
      tl.marker = marker;
      if (drop) await dropMarkerSaves(page, tl, row);
      server = watchServer(tl, () => redis.hget(`notes:${anon}`, id));
      await editor(page).click();
      await page.keyboard.type(marker, { delay: 25 });
      const t = Date.now();
      row.editorHadMarker = await editor(page).evaluate((el, m) => !!el.textContent?.includes(m), marker);
      await page.waitForTimeout(Math.max(0, closeDelay - (Date.now() - t)));
      tl.ev(`tab1 close after ${closeDelay}ms`);
      await page.close({ runBeforeUnload: true });

      // 1. Server, no tab open (what any other device would load).
      await new Promise((r) => setTimeout(r, 10_000));
      row.serverAfter10sNoTab = server.landedAt() !== null;
      tl.ev(`server has marker 10s after close, no tab open: ${row.serverAfter10sNoTab}`);

      // 2. New tab, same browser.
      const tab2 = await ctx.newPage();
      labels.set(tab2, "newtab");
      await tab2.goto("/");
      await waitForApp(tab2);
      row.newTabShows = await expect(tab2.locator(`[data-note-card="${id}"]`))
        .toContainText(marker, { timeout: 20_000 })
        .then(() => true, () => false);
      tl.ev(`new tab shows marker: ${row.newTabShows}; state=${JSON.stringify(await tabState(tab2, id, marker))}`);
      await expect.poll(() => server!.landedAt(), { timeout: 15_000 }).not.toBeNull().catch(() => {});
      row.serverAfterNewTab = server.landedAt() !== null;
      tl.ev(`server has marker after new tab: ${row.serverAfterNewTab}`);

      // 3. Another device with the same guest identity (fresh profile, no IDB).
      device2 = await browser.newContext({ baseURL });
      await device2.addInitScript((a) => localStorage.setItem("notes_user_id", a), anon);
      const d2 = await device2.newPage();
      await d2.goto("/");
      await waitForApp(d2);
      row.otherDeviceShows = await expect(d2.locator(`[data-note-card="${id}"]`))
        .toContainText(marker, { timeout: 20_000 })
        .then(() => true, () => false);
      tl.ev(`other device shows marker: ${row.otherDeviceShows}`);
    } finally {
      await server?.stop();
      row.serverLandedAtMs = server?.landedAt() ?? null;
      await device2?.close().catch(() => {});
      await ctx.close().catch(() => {});
      redis.disconnect();
      await finish(testInfo, tl, row);
    }
    expect(row.newTabShows, "new tab").toBe(true);
    expect(row.otherDeviceShows, "other device").toBe(true);
  });

  // Real world, cloud: the keepalive leave-save is the only thing that can get
  // the text to the server before the browser comes back.
  test(`real-world: cloud note, close within 0.5s${n}`, async ({ baseURL, browser }, testInfo) => {
    test.skip(!hasAdminEnv() || seededAccounts().length < 1, "needs seeded accounts");
    test.setTimeout(180_000);
    const [acc] = seededAccounts();
    const tl = new Timeline();
    const labels = new Map<Page, string>();
    const userDataDir = testInfo.outputPath("profile");
    const ctx = await launch(testInfo, userDataDir, baseURL, "1", tl);
    watchContext(ctx, tl, labels);
    await signIn(ctx, acc, { baseURL });
    const closeDelay = Math.floor(Math.random() * 500);
    const row: Record<string, unknown> = { kind: "cloud-close", drop, closeDelay };
    let server: ReturnType<typeof watchServer> | null = null;
    let device2: BrowserContext | null = null;
    let id: string | null = null;
    const cloud = async () => {
      const { data } = await adminClient().from("notes").select("content").eq("id", id!).maybeSingle();
      return (data?.content as string | undefined) ?? null;
    };
    try {
      const page = await ctx.newPage();
      labels.set(page, "tab1");
      await throttle(ctx, page);
      await page.goto("/");
      await waitForApp(page);
      const before = await activeCardId(page);
      await page.locator("body").press("Control+j");
      await expect.poll(() => activeCardId(page)).not.toBe(before);
      await expect(editor(page)).toBeVisible();
      id = (await activeCardId(page))!;
      row.noteId = id;
      await expect.poll(cloud, { timeout: 15_000 }).not.toBeNull(); // the create landed

      const marker = `e2e-rw-cloud-${Date.now()}`;
      tl.marker = marker;
      if (drop) await dropMarkerSaves(page, tl, row);
      server = watchServer(tl, cloud, 150);
      await editor(page).click();
      await page.keyboard.type(marker, { delay: 25 });
      const t = Date.now();
      row.editorHadMarker = await editor(page).evaluate((el, m) => !!el.textContent?.includes(m), marker);
      await page.waitForTimeout(Math.max(0, closeDelay - (Date.now() - t)));
      tl.ev(`tab1 close after ${closeDelay}ms`);
      await page.close({ runBeforeUnload: true });

      await new Promise((r) => setTimeout(r, 10_000));
      row.serverAfter10sNoTab = server.landedAt() !== null;
      tl.ev(`server has marker 10s after close, no tab open: ${row.serverAfter10sNoTab}`);

      device2 = await browser.newContext({ baseURL });
      await signIn(device2, acc, { baseURL });
      const d2 = await device2.newPage();
      await d2.goto("/");
      await waitForApp(d2);
      row.otherDeviceShowsBeforeReopen = await expect(d2.locator(`[data-note-card="${id}"]`))
        .toContainText(marker, { timeout: 15_000 })
        .then(() => true, () => false);
      tl.ev(`other device (before same-browser reopen) shows marker: ${row.otherDeviceShowsBeforeReopen}`);
      await d2.close();

      const tab2 = await ctx.newPage();
      labels.set(tab2, "newtab");
      await tab2.goto("/");
      await waitForApp(tab2);
      row.newTabShows = await expect(tab2.locator(`[data-note-card="${id}"]`))
        .toContainText(marker, { timeout: 20_000 })
        .then(() => true, () => false);
      tl.ev(`new tab shows marker: ${row.newTabShows}; state=${JSON.stringify(await tabState(tab2, id, marker))}`);
    } finally {
      await server?.stop();
      row.serverLandedAtMs = server?.landedAt() ?? null;
      await device2?.close().catch(() => {});
      await ctx.close().catch(() => {});
      if (id) await adminClient().from("notes").delete().eq("id", id).then(() => {}, () => {});
      await finish(testInfo, tl, row);
    }
    // With every network save dropped and no other tab, nothing CAN reach
    // another device before this browser reopens: only checked without a drop.
    if (!drop) {
      expect(row.otherDeviceShowsBeforeReopen, "other device sees it without the same browser reopening").toBe(true);
    }
    expect(row.newTabShows, "new tab").toBe(true);
  });
  }
  }
});
