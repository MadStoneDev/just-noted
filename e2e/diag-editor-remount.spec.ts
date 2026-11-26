import fs from "node:fs";
import path from "node:path";
import Redis from "ioredis";
import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures/no-conflicts";
import { seededAccounts, signIn } from "./fixtures/auth";
import { adminClient, hasAdminEnv } from "./fixtures/admin";
import { e2eFileEnv } from "./fixtures/env";

// DIAGNOSTIC ONLY (docs/tickets/editor-recreated-while-typing.md). Skipped
// unless E2E_DIAG=1.
//
// Is the editor view recreated while typing starts, what triggers it, and are
// keystrokes lost? An init script records, in page time:
//   - every `.ProseMirror` element created / removed (with its text on
//     removal — what a replaced view held),
//   - every keydown (and which view it went to), focus / visibility events,
//   - cross-tab note-update messages,
// and the test records the page's server actions (with their operation) and
// responses. Each run writes a timeline + one summary.jsonl row: views created
// during typing, whether the typed text is intact in the editor, the IDB cache
// and the server once things settle.
//
//   E2E_DIAG=1  E2E_DIAG_REPEAT=<n>  E2E_DIAG_OUT=<dir>
//   E2E_DIAG_HOLD=<op>   hold that server-action operation (e.g. getAll) from
//                        the moment typing starts until it ends — to test
//                        whether a refresh is the trigger.

const ON = process.env.E2E_DIAG === "1";
const REPEAT = Math.max(1, Number(process.env.E2E_DIAG_REPEAT || 1));
const OUT = process.env.E2E_DIAG_OUT || path.resolve(__dirname, "../test-results/diag-remount");
const HOLD = process.env.E2E_DIAG_HOLD || "";

const EDITOR = ".ProseMirror";
const editor = (p: Page) => p.locator(EDITOR).first();
const waitForApp = (p: Page) => expect(p.getByRole("heading", { name: "All Notes" })).toBeVisible();

async function activeCardId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.querySelector('[data-note-card][data-active="true"]')?.getAttribute("data-note-card") ?? null,
  );
}

// ── In-page recorder ────────────────────────────────────────────────────────

async function installRecorder(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    const w = window as any;
    if (w.__rec) return;
    const ev: { t: number; s: string }[] = (w.__rec = []);
    const log = (s: string) => ev.push({ t: Math.round(performance.timeOrigin + performance.now()), s });
    let nextId = 1;
    const ids = new WeakMap<Element, number>();
    const scan = (n: Node, added: boolean) => {
      if (!(n instanceof Element)) return;
      const pms = n.matches(".ProseMirror") ? [n] : Array.from(n.querySelectorAll(".ProseMirror"));
      for (const pm of pms) {
        if (added) {
          if (ids.has(pm)) continue;
          ids.set(pm, nextId++);
          log(`view+ #${ids.get(pm)} editable=${pm.getAttribute("contenteditable")} text=${JSON.stringify((pm.textContent ?? "").slice(-60))}`);
        } else {
          log(`view- #${ids.get(pm) ?? "?"} text=${JSON.stringify((pm.textContent ?? "").slice(-60))}`);
        }
      }
    };
    new MutationObserver((muts) => {
      for (const m of muts) {
        m.removedNodes.forEach((n) => scan(n, false));
        m.addedNodes.forEach((n) => scan(n, true));
        if (m.type === "attributes" && (m.target as Element).matches?.(".ProseMirror")) {
          log(`view #${ids.get(m.target as Element) ?? "?"} contenteditable=${(m.target as Element).getAttribute("contenteditable")}`);
        }
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["contenteditable"] });
    document.addEventListener(
      "keydown",
      (e) => {
        const pm = (e.target as Element)?.closest?.(".ProseMirror");
        log(`key ${e.key} → ${pm ? `#${ids.get(pm)}` : `<${(e.target as Element)?.tagName}>`}`);
      },
      true,
    );
    addEventListener("focus", () => log("window focus"));
    addEventListener("blur", () => log("window blur"));
    document.addEventListener("visibilitychange", () => log(`visibility ${document.visibilityState}`));
    try {
      new BroadcastChannel("justnoted-note-updates").onmessage = (e) =>
        log(`bc note-update ${JSON.stringify(e.data).slice(0, 140)}`);
    } catch {}
    const warn = console.warn;
    console.warn = (...a: unknown[]) => {
      if (String(a[0]).includes("white-space")) log("PM view constructed (white-space warning)");
      return warn.apply(console, a as []);
    };
  });
}

interface Row {
  [k: string]: unknown;
}

class Timeline {
  lines: { t: number; s: string }[] = [];
  ev(s: string, t = Date.now()) {
    this.lines.push({ t, s });
  }
  dump(file: string, t0: number) {
    fs.writeFileSync(
      file,
      this.lines
        .sort((a, b) => a.t - b.t)
        .map((l) => `${String(l.t - t0).padStart(7)}ms ${l.s}`)
        .join("\n") + "\n",
    );
  }
}

function watchNetwork(ctx: BrowserContext, tl: Timeline, labels: Map<Page, string>) {
  const lab = (r: import("@playwright/test").Request) => {
    try {
      return labels.get(r.frame().page()) ?? "?";
    } catch {
      return "?";
    }
  };
  const op = (r: import("@playwright/test").Request) => {
    const b = r.postData() ?? "";
    return b.match(/"operation":"(\w+)"/)?.[1] ?? (r.headers()["next-action"] ? `action:${b.slice(0, 50)}` : "");
  };
  ctx.on("request", (r) => {
    if (r.method() !== "POST") return;
    tl.ev(`[${lab(r)}] → ${new URL(r.url()).pathname} ${op(r)}`);
  });
  ctx.on("requestfinished", (r) => {
    if (r.method() !== "POST") return;
    tl.ev(`[${lab(r)}] ← ${new URL(r.url()).pathname} ${op(r)}`);
  });
}

async function pullRecorder(page: Page, label: string, tl: Timeline) {
  const ev: { t: number; s: string }[] = await page.evaluate(() => (window as any).__rec ?? []).catch(() => []);
  for (const e of ev) tl.ev(`[${label}] ${e.s}`, e.t);
  return ev;
}

function valkey() {
  return new Redis(e2eFileEnv().VALKEY_URL || process.env.VALKEY_URL || "redis://127.0.0.1:6380", {
    keyPrefix: "justnoted:",
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
}

async function cacheText(page: Page, id: string): Promise<string> {
  return page.evaluate(
    (id) =>
      new Promise<string>((res) => {
        const r = indexedDB.open("NotesCacheDB");
        r.onsuccess = () => {
          const q = r.result.transaction("notes").objectStore("notes").get(id);
          q.onsuccess = () => res(String(q.result?.content ?? ""));
          q.onerror = () => res("");
        };
        r.onerror = () => res("");
      }),
    id,
  );
}

async function hold(page: Page, opName: string) {
  const held: (() => void)[] = [];
  let on = false;
  await page.route("**/*", async (route) => {
    const r = route.request();
    if (on && r.method() === "POST" && (r.postData() ?? "").includes(`"operation":"${opName}"`)) {
      await new Promise<void>((res) => held.push(res));
    }
    return route.fallback();
  });
  return {
    start: () => (on = true),
    release: () => {
      on = false;
      held.splice(0).forEach((f) => f());
    },
  };
}

function summarise(ev: { t: number; s: string }[], typingStart: number, typingEnd: number) {
  const views = ev.filter((e) => e.s.startsWith("view+"));
  const during = views.filter((e) => e.t >= typingStart - 50 && e.t <= typingEnd + 1000);
  const keys = ev.filter((e) => e.s.startsWith("key "));
  const keysToOldView = during.length
    ? keys.filter((k) => k.t < during[0].t && k.t >= typingStart - 50).length
    : 0;
  return {
    viewsTotal: views.length,
    viewsDuringTyping: during.length,
    firstRemountAfterTypingStartMs: during.length ? during[0].t - typingStart : null,
    keysBeforeRemount: keysToOldView,
  };
}

function writeRow(testInfo: import("@playwright/test").TestInfo, tl: Timeline, t0: number, row: Row) {
  const file = testInfo.outputPath("timeline.txt");
  tl.dump(file, t0);
  fs.mkdirSync(OUT, { recursive: true });
  fs.appendFileSync(
    path.join(OUT, "summary.jsonl"),
    JSON.stringify({ ...row, test: testInfo.title, hold: HOLD || null, timeline: file }) + "\n",
  );
}

// ── Scenarios ───────────────────────────────────────────────────────────────

type Scenario = "replica" | "single-tab" | "type-at-once";

test.describe("DIAG editor remount while typing", () => {
  test.skip(!ON, "diagnostic — set E2E_DIAG=1");

  for (let rep = 0; rep < REPEAT; rep++) {
    const n = REPEAT > 1 ? ` #${rep + 1}` : "";
    for (const scenario of ["replica", "single-tab", "type-at-once"] as Scenario[]) {
      test(`guest: ${scenario}${n}`, async ({ context, page }, testInfo) => {
        test.setTimeout(120_000);
        const tl = new Timeline();
        const labels = new Map<Page, string>([[page, "tab1"]]);
        await installRecorder(context);
        watchNetwork(context, tl, labels);
        const holder = HOLD ? await hold(page, HOLD) : null;
        const t0 = Date.now();
        const row: Row = { kind: "guest", scenario };
        const redis = valkey();
        try {
          await page.goto("/");
          await waitForApp(page);
          await page.getByRole("main", { name: "Note editor" }).getByRole("button", { name: "New note" }).click();
          await expect(editor(page)).toBeVisible();
          const id = (await activeCardId(page))!;
          const anon = (await page.evaluate(() => localStorage.getItem("notes_user_id")))!;
          tl.ev(`created ${id}`);
          if (scenario !== "type-at-once") await page.waitForTimeout(2500);
          if (scenario === "replica") {
            const other = await context.newPage();
            labels.set(other, "tab2");
            await other.goto("/");
            await waitForApp(other);
            await page.bringToFront();
            tl.ev("tab1 bringToFront");
          }
          const marker = `e2e-rm-${Date.now()}`;
          await editor(page).click();
          holder?.start();
          const typingStart = Date.now();
          tl.ev("typing start");
          await page.keyboard.type(marker);
          const typingEnd = Date.now();
          tl.ev("typing end");
          // Settle: debounce + autosave + any refresh.
          await page.waitForTimeout(4000);
          holder?.release();
          await page.waitForTimeout(2000);
          const editorText = (await editor(page).textContent()) ?? "";
          row.editorIntact = editorText.includes(marker);
          row.editorText = editorText.slice(0, 80);
          row.cacheIntact = (await cacheText(page, id)).includes(marker);
          await expect
            .poll(async () => JSON.parse((await redis.hget(`notes:${anon}`, id)) ?? "{}").content ?? "", {
              timeout: 10_000,
            })
            .toContain(marker)
            .catch(() => {});
          const server = JSON.parse((await redis.hget(`notes:${anon}`, id)) ?? "{}").content ?? "";
          row.serverIntact = String(server).includes(marker);
          row.serverText = String(server).slice(0, 80);
          const ev = await pullRecorder(page, "tab1", tl);
          Object.assign(row, summarise(ev, typingStart, typingEnd));
          for (const [p, l] of labels) if (p !== page) await pullRecorder(p, l, tl);
        } finally {
          redis.disconnect();
          writeRow(testInfo, tl, t0, row);
        }
      });
    }

    test(`cloud: single-tab${n}`, async ({ context, page }, testInfo) => {
      test.skip(!hasAdminEnv() || seededAccounts().length < 1, "needs seeded accounts");
      test.setTimeout(120_000);
      const [acc] = seededAccounts();
      const tl = new Timeline();
      const labels = new Map<Page, string>([[page, "tab1"]]);
      await installRecorder(context);
      watchNetwork(context, tl, labels);
      const holder = HOLD ? await hold(page, HOLD) : null;
      const t0 = Date.now();
      const row: Row = { kind: "cloud", scenario: "single-tab" };
      let id: string | null = null;
      try {
        await signIn(page, acc);
        await page.goto("/");
        await waitForApp(page);
        const before = await activeCardId(page);
        await page.locator("body").press("Control+j");
        await expect.poll(() => activeCardId(page)).not.toBe(before);
        await expect(editor(page)).toBeVisible();
        id = (await activeCardId(page))!;
        await page.waitForTimeout(2500);
        const marker = `e2e-rm-cloud-${Date.now()}`;
        await editor(page).click();
        holder?.start();
        const typingStart = Date.now();
        await page.keyboard.type(marker);
        const typingEnd = Date.now();
        await page.waitForTimeout(4000);
        holder?.release();
        await page.waitForTimeout(2000);
        row.editorIntact = ((await editor(page).textContent()) ?? "").includes(marker);
        row.cacheIntact = (await cacheText(page, id)).includes(marker);
        await expect
          .poll(async () => {
            const { data } = await adminClient().from("notes").select("content").eq("id", id!).maybeSingle();
            return String(data?.content ?? "");
          }, { timeout: 10_000 })
          .toContain(marker)
          .catch(() => {});
        const { data } = await adminClient().from("notes").select("content").eq("id", id).maybeSingle();
        row.serverIntact = String(data?.content ?? "").includes(marker);
        const ev = await pullRecorder(page, "tab1", tl);
        Object.assign(row, summarise(ev, typingStart, typingEnd));
      } finally {
        if (id) await adminClient().from("notes").delete().eq("id", id).then(() => {}, () => {});
        writeRow(testInfo, tl, t0, row);
      }
    });
  }
});
