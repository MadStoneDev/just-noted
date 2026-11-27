import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures/no-conflicts";
import { seededAccounts, signIn } from "./fixtures/auth";
import { makeSharedNote, serverNote, safetyVersions, SHARED_BODY } from "./fixtures/collab";
import { adminClient } from "./fixtures/admin";

// The stored Yjs doc's life outside a single editing session
// (docs/diagnostics/shared-note-overwrite, section 5 follow-ups).
//
//  1. Unshare → edit → reshare: the doc of the shared period must not come
//     back and win over the text written since (its projection used to write
//     the old text back). Unsharing deletes it; a doc that is still stale when
//     loaded (older data) is discarded and the note re-seeds from its content.
//  2. Background writes on a collaborative note (offline-queue replay, the
//     tab-close keepalive save) merge the editor's doc into the stored one
//     instead of a version check, so a collaborator's save in between makes
//     no "(conflicted copy)" (the no-conflicts fixture checks that) and both
//     edits survive.
//
// Each test uses its own note: A owns it, B can edit.

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3050";
const editorIn = (scope: Page | ReturnType<Page["locator"]>) => scope.locator(".ProseMirror").first();

async function openAsOwner(page: Page, id: string, expectText = "Shared with B") {
  await page.goto(`${BASE_URL}/`);
  await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
  await page.locator(`[data-note-card="${id}"]`).click();
  await expect(editorIn(page)).toContainText(expectText);
}

async function openAsRecipient(page: Page, shortcode: string) {
  await page.goto(`${BASE_URL}/n/${shortcode}`);
  const view = page.locator('main[aria-label="Shared note"]');
  await expect(editorIn(view)).toBeVisible();
  return view;
}

async function typeAtEnd(page: Page, scope: Page | ReturnType<Page["locator"]>, text: string) {
  await editorIn(scope).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
}

async function storedDoc(id: string) {
  const { data } = await adminClient().from("note_ydoc").select("updated_at").eq("note_id", id).maybeSingle();
  return data as { updated_at: string } | null;
}

async function reshareWith(noteId: string, editorId: string, handle: string) {
  const db = adminClient();
  const { data: s } = await db.from("shared_notes").select("id").eq("note_id", noteId).single();
  const { error } = await db
    .from("shared_notes_readers")
    .insert({ shared_note: (s as any).id, reader_id: editorId, reader_username: handle, role: "edit" });
  if (error) throw new Error(`reshare: ${error.message}`);
}

/**
 * Cut this page off from Supabase Realtime on demand (both directions), so a
 * peer gets none of its edits: the background write is then the only way
 * they can reach the server. Install before the page's first navigation.
 */
async function realtimeSwitch(page: Page) {
  const state = { blocked: false };
  await page.routeWebSocket(/\/realtime\//, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => {
      if (!state.blocked) server.send(m);
    });
    server.onMessage((m) => {
      if (!state.blocked) ws.send(m);
    });
  });
  return state;
}

/** Make every fetch from this page fail once `window.__e2eNetDown` is set. */
async function failFetchesWhenNetDown(page: Page) {
  await page.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
      if ((window as any).__e2eNetDown) return Promise.reject(new TypeError("Failed to fetch"));
      return orig.apply(this, args);
    } as typeof fetch;
  });
}

test.describe("the stored doc across unshare and background writes", () => {
  test.skip(() => seededAccounts().length < 2, "needs 2 seeded accounts");
  test.setTimeout(120_000);

  test("unshare → edit → reshare keeps the edit", async ({ page, context }) => {
    const [a, b] = seededAccounts();
    const { id, shortcode } = await makeSharedNote(a, b);
    await signIn(page, a);
    await openAsOwner(page, id);
    // Collaborating: the doc is stored.
    await expect.poll(async () => (await serverNote(id)).doc ?? "", { timeout: 20_000 }).toContain(SHARED_BODY);

    // Unshare: remove B, the only editor. The doc goes with it.
    await page.getByRole("button", { name: "Share note" }).click();
    await page.getByRole("button", { name: `Remove @${b.handle}` }).click();
    await expect.poll(() => storedDoc(id), { timeout: 15_000 }).toBeNull();
    await page.keyboard.press("Escape");

    // Edit while not shared (the plain editor).
    const marker = `while-unshared-${Date.now()}`;
    await typeAtEnd(page, page, ` ${marker}`);
    await expect.poll(async () => (await serverNote(id)).content, { timeout: 20_000 }).toContain(marker);

    // Reshare, then open again as the owner and as B.
    await reshareWith(id, b.id, b.handle);
    await openAsOwner(page, id, marker);
    await expect.poll(async () => (await serverNote(id)).doc ?? "", { timeout: 20_000 }).toContain(marker);

    const other = await context.browser()!.newContext();
    await signIn(other, b);
    const pageB = await other.newPage();
    const viewB = await openAsRecipient(pageB, shortcode);
    await expect(editorIn(viewB)).toContainText(marker);
    await page.waitForTimeout(4000); // any projection of an old doc would have landed
    const s = await serverNote(id);
    expect(s.content).toContain(`${SHARED_BODY} ${marker}`);
    expect(s.doc).toContain(marker);
    await expect(editorIn(page)).toContainText(marker);
    await other.close();
  });

  test("a doc the content was saved past without it is discarded on load", async ({ page, context }) => {
    const [a, b] = seededAccounts();
    const { id, shortcode } = await makeSharedNote(a, b);
    await signIn(page, a);
    await openAsOwner(page, id);
    await expect.poll(async () => (await serverNote(id)).doc ?? "", { timeout: 20_000 }).toContain(SHARED_BODY);
    await page.goto("about:blank");
    await page.waitForTimeout(2000); // the editor's last doc save has landed

    // What a note unshared, edited and reshared before the fix looks like: the
    // content was saved (without the doc) well after the doc's last save.
    const marker = `saved-past-doc-${Date.now()}`;
    const db = adminClient();
    await db.from("note_ydoc").update({ updated_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("note_id", id);
    const { data: n } = await db.from("notes").select("version").eq("id", id).single();
    await db
      .from("notes")
      .update({ content: `${SHARED_BODY} ${marker}`, version: (n as any).version + 1, updated_at: new Date().toISOString() })
      .eq("id", id);

    // B opens first: the stale doc is discarded and the note re-seeds from its content.
    const other = await context.browser()!.newContext();
    await signIn(other, b);
    const pageB = await other.newPage();
    const viewB = await openAsRecipient(pageB, shortcode);
    await expect(editorIn(viewB)).toContainText(marker);
    await expect.poll(async () => (await serverNote(id)).doc ?? "", { timeout: 20_000 }).toContain(marker);

    await openAsOwner(page, id, marker);
    await page.waitForTimeout(4000);
    const s = await serverNote(id);
    expect(s.content).toContain(`${SHARED_BODY} ${marker}`);
    expect(s.doc).toContain(marker);
    // The discarded doc's words went to Version history.
    const v = await safetyVersions(id);
    expect(v.some((x) => x.content.includes(SHARED_BODY) && !x.content.includes(marker))).toBe(true);
    await other.close();
    await db.from("note_versions").delete().eq("note_id", id);
  });

  test("offline queue replay on a shared note merges into the doc: no conflicted copy", async ({ browser }) => {
    const [a, b] = seededAccounts();
    const { id, shortcode } = await makeSharedNote(a, b);
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    try {
      await signIn(ctxA, a);
      await signIn(ctxB, b);
      const pageA = await ctxA.newPage();
      await failFetchesWhenNetDown(pageA);
      const rtA = await realtimeSwitch(pageA);
      await openAsOwner(pageA, id);
      const pageB = await ctxB.newPage();
      const viewB = await openAsRecipient(pageB, shortcode);
      await expect(editorIn(viewB)).toContainText(SHARED_BODY);
      await pageA.waitForTimeout(2500); // both bound to the doc
      const { version: base } = await serverNote(id);

      // A goes offline and types; its failed save is queued. Then it closes:
      // only the offline-queue entry has the text.
      rtA.blocked = true;
      await pageA.evaluate(() => ((window as any).__e2eNetDown = true));
      await ctxA.setOffline(true);
      const ma = `queued-A-${Date.now()}`;
      await typeAtEnd(pageA, pageA, ` ${ma}`);
      await expect(editorIn(pageA)).toContainText(ma);
      await pageA.waitForTimeout(4000); // the autosave fails and queues the edit
      const closed = pageA.waitForEvent("close");
      await pageA.close({ runBeforeUnload: true });
      await closed;
      await ctxA.setOffline(false);
      expect((await serverNote(id)).doc ?? "").not.toContain(ma);

      // Meanwhile B edits: the server moves past A's base version.
      const mb = `online-B-${Date.now()}`;
      await editorIn(viewB).locator("p", { hasText: SHARED_BODY }).click();
      await pageB.keyboard.press("Home");
      await pageB.keyboard.type(`${mb} `);
      await expect.poll(async () => (await serverNote(id)).content, { timeout: 20_000 }).toContain(mb);
      expect((await serverNote(id)).version).toBeGreaterThan(base as number);
      expect((await serverNote(id)).doc ?? "").not.toContain(ma);

      // A comes back and opens the note: the queued edit (its doc state) is
      // merged into the doc, next to B's — whether the queue replays it or the
      // editor, which owns the note's uploads while it is open, takes it in.
      const pageA2 = await ctxA.newPage();
      await openAsOwner(pageA2, id);
      await expect.poll(async () => (await serverNote(id)).doc ?? "", { timeout: 30_000 }).toContain(ma);
      expect((await serverNote(id)).doc).toContain(mb);

      // ...and the content follows the doc.
      await expect(editorIn(pageA2)).toContainText(ma);
      await expect(editorIn(pageA2)).toContainText(mb);
      await expect.poll(async () => (await serverNote(id)).content, { timeout: 20_000 }).toContain(ma);
      const s = await serverNote(id);
      expect(s.content).toContain(mb);
      expect(s.content).toContain(SHARED_BODY);
      await expect(editorIn(viewB)).toContainText(ma, { timeout: 20_000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test("tab-close save on a shared note merges into the doc: no conflicted copy", async ({ browser }) => {
    const [a, b] = seededAccounts();
    const { id, shortcode } = await makeSharedNote(a, b);
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    try {
      await signIn(ctxA, a);
      await signIn(ctxB, b);
      const pageA = await ctxA.newPage();
      const rtA = await realtimeSwitch(pageA);
      await openAsOwner(pageA, id);
      const pageB = await ctxB.newPage();
      const viewB = await openAsRecipient(pageB, shortcode);
      await expect(editorIn(viewB)).toContainText(SHARED_BODY);
      await pageA.waitForTimeout(2500); // both bound to the doc

      // From here A reaches nobody over realtime, and its saves fail (server actions are POSTs): only the
      // keepalive save on close gets through.
      await pageA.route("**/*", (route) => {
        const r = route.request();
        if (r.method() === "POST" && !r.url().includes("/api/notes/leave-save")) return route.abort();
        return route.fallback();
      });
      rtA.blocked = true;
      const ma = `closing-A-${Date.now()}`;
      await typeAtEnd(pageA, pageA, ` ${ma}`);
      await expect(editorIn(pageA)).toContainText(ma);

      // B saves first: the server is past A's base when A's keepalive lands.
      const mb = `online-B-${Date.now()}`;
      await editorIn(viewB).locator("p", { hasText: SHARED_BODY }).click();
      await pageB.keyboard.press("Home");
      await pageB.keyboard.type(`${mb} `);
      await expect.poll(async () => (await serverNote(id)).content, { timeout: 20_000 }).toContain(mb);
      expect((await serverNote(id)).doc ?? "").not.toContain(ma);

      await pageA.close({ runBeforeUnload: true });
      await expect.poll(async () => (await serverNote(id)).doc ?? "", { timeout: 20_000 }).toContain(ma);
      expect((await serverNote(id)).doc).toContain(mb);

      // The next open projects the merged doc into the content.
      const pageA2 = await ctxA.newPage();
      await openAsOwner(pageA2, id, mb);
      await expect(editorIn(pageA2)).toContainText(ma);
      // (A's last projection may have landed on its way out, without B's edit:
      // a save started during teardown gets past page.route.)
      for (const m of [ma, mb]) {
        await expect.poll(async () => (await serverNote(id)).content, { timeout: 20_000 }).toContain(m);
      }
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
