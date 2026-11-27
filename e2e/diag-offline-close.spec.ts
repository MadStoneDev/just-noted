import fs from "node:fs";
import path from "node:path";
import Redis from "ioredis";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/no-conflicts";
import { e2eFileEnv } from "./fixtures/env";

// DIAGNOSTIC (not part of the normal suite): why "network lost at close"
// (e2e/leave-save.spec.ts) sometimes finds the text on the server before the
// next open. Types into a guest note, takes the context offline, closes the tab
// and records, in the page (localStorage, synchronous, survives the close):
// every fetch (time, url, server-action id, keepalive, body has the marker,
// outcome), and the online/offline, visibilitychange, beforeunload and
// pagehide events. Then reads the server copy and writes one JSON line per run.
//
//   E2E_DIAG=1 E2E_DIAG_REPEAT=20 npx playwright test e2e/diag-offline-close.spec.ts

test.skip(!process.env.E2E_DIAG, "diagnostic; set E2E_DIAG=1");

const REPEAT = Number(process.env.E2E_DIAG_REPEAT || 1);
const OUT = process.env.E2E_DIAG_OUT ?? "test-results/diag-offline-close";
const editor = (p: Page) => p.locator(".ProseMirror").first();

async function guestContent(anon: string, id: string): Promise<string> {
  const r = new Redis(e2eFileEnv().VALKEY_URL || process.env.VALKEY_URL || "redis://127.0.0.1:6380", {
    keyPrefix: "justnoted:",
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    const raw = await r.hget(`notes:${anon}`, id);
    return raw ? String(JSON.parse(raw).content ?? "") : "";
  } finally {
    r.disconnect();
  }
}

for (let i = 0; i < REPEAT; i++) {
  test(`offline close probe #${i}`, async ({ context, page }) => {
    const marker = `e2e-oc-${Date.now()}-${i}`;
    await page.addInitScript((mk: string) => {
      const t0 = performance.timeOrigin;
      const log = (s: string) => {
        try {
          const cur = JSON.parse(localStorage.getItem("__diag_oc") || "[]");
          cur.push(`${Math.round(t0 + performance.now())} ${s}`);
          localStorage.setItem("__diag_oc", JSON.stringify(cur));
        } catch {}
      };
      (window as any).__diagLog = log;
      const orig = window.fetch;
      let n = 0;
      window.fetch = function (this: unknown, input: any, init?: any) {
        const id = ++n;
        const url = typeof input === "string" ? input : input?.url ?? String(input);
        const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        const act = (h.get("next-action") ?? "").slice(0, 10);
        const body = typeof init?.body === "string" ? init.body : "";
        const has = body.includes(mk);
        const tag = `#${id} ${init?.method ?? "GET"} ${url.replace(location.origin, "")}${act ? ` act=${act}` : ""}${init?.keepalive ? " keepalive" : ""}${has ? " HAS-MARKER" : ""}`;
        if (has || init?.keepalive || (init?.method ?? "GET") !== "GET") log(`fetch ${tag} online=${navigator.onLine}`);
        const p = orig.call(this, input, init);
        if (has || init?.keepalive) p.then((r) => log(`done ${tag} ${r.status}`), (e) => log(`fail ${tag} ${e?.message ?? e}`));
        return p;
      } as typeof fetch;
      addEventListener("online", () => log("event online"));
      addEventListener("offline", () => log("event offline"));
      addEventListener("beforeunload", () => log("event beforeunload"), true);
      addEventListener("pagehide", () => log("event pagehide"), true);
      document.addEventListener("visibilitychange", () => log(`event visibility ${document.visibilityState}`), true);
    }, marker);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
    await page.getByRole("main", { name: "Note editor" }).getByRole("button", { name: "New note" }).click();
    await expect(editor(page)).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.querySelector('[data-note-card][data-active="true"]')?.getAttribute("data-note-card") ?? null))
      .not.toBeNull();
    const id = (await page.evaluate(() => document.querySelector('[data-note-card][data-active="true"]')!.getAttribute("data-note-card")))!;
    const anon = (await page.evaluate(() => localStorage.getItem("notes_user_id")))!;
    await page.waitForTimeout(2500);
    await page.evaluate(() => localStorage.setItem("__diag_oc", "[]"));

    const mark = (s: string) => page.evaluate((x) => (window as any).__diagLog(`test ${x}`), s).catch(() => {});
    await editor(page).click();
    await page.keyboard.press("End");
    await mark("typing");
    await page.keyboard.type(marker);
    await expect(editor(page)).toContainText(marker);
    await mark("typed; setOffline(true)");
    await context.setOffline(true);
    await mark("setOffline resolved; close");
    const closed = page.waitForEvent("close");
    await page.close({ runBeforeUnload: true });
    await closed;
    await context.setOffline(false);
    const closedAt = Date.now();
    await new Promise((r) => setTimeout(r, 3000));
    const server = await guestContent(anon, id);

    const reader = await context.newPage();
    await reader.goto("/api/health");
    const log: string[] = await reader.evaluate(() => JSON.parse(localStorage.getItem("__diag_oc") || "[]"));
    await reader.close();

    const line = {
      run: i,
      marker,
      leaked: server.includes(marker),
      closedAt,
      log: log.map((l) => {
        const [t, ...rest] = l.split(" ");
        return `${Number(t) - Number(marker.split("-")[2])} ${rest.join(" ")}`;
      }),
    };
    fs.mkdirSync(OUT, { recursive: true });
    fs.appendFileSync(path.join(OUT, "summary.jsonl"), JSON.stringify(line) + "\n");
    console.log(JSON.stringify(line));
  });
}
