import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures/no-conflicts";
import { seededAccounts, signIn } from "./fixtures/auth";
import { makeSharedNote, serverNote, safetyVersions, SHARED_BODY } from "./fixtures/collab";
import { adminClient } from "./fixtures/admin";

// Typing right after a shared note opens must never cost the note its body
// (docs/diagnostics/shared-note-overwrite). The editor used to switch into
// live collaboration on an EMPTY Yjs doc and fill it only after a 1 s grace,
// if still empty: anything typed first became the whole doc, and the save
// projected from it replaced the body. A failed doc load did the same, and
// the save then REPLACED the stored doc for every collaborator.
//
// Each test uses its own note (A owns it, B can edit), so specs can't disturb
// each other or the seeded note.

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3050";
const editorIn = (scope: Page | ReturnType<Page["locator"]>) => scope.locator(".ProseMirror").first();

async function openAsOwner(page: Page, id: string) {
  await page.goto(`${BASE_URL}/`);
  await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible();
  await page.locator(`[data-note-card="${id}"]`).click();
  await expect(editorIn(page)).toContainText("Shared with B");
}

async function openAsRecipient(page: Page, shortcode: string) {
  await page.goto(`${BASE_URL}/n/${shortcode}`);
  const view = page.locator('main[aria-label="Shared note"]');
  await expect(editorIn(view)).toBeVisible();
  return view;
}

async function typeAtEnd(page: Page, scope: Page | ReturnType<Page["locator"]>, text: string) {
  await editorIn(scope).click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

// Wait for the owner's editor to switch into live collaboration (it loads the doc).
const collabLoadFor = (page: Page, id: string) =>
  page.waitForRequest((r) => r.url().includes("/api/collab") && r.url().includes(id), { timeout: 20_000 });

// Store the doc once, as a first online open would.
async function seedStoredDoc(context: BrowserContext, id: string) {
  const first = await context.newPage();
  await openAsOwner(first, id);
  await expect.poll(async () => (await serverNote(id)).doc ?? "", { timeout: 20_000 }).toContain(SHARED_BODY);
  await first.close();
}

test.describe("typing as a shared note opens keeps its body", () => {
  test.skip(() => seededAccounts().length < 2, "needs 2 seeded accounts");
  test.setTimeout(90_000);

  test("owner: typing the moment live collaboration starts", async ({ page }) => {
    const [a, b] = seededAccounts();
    const { id } = await makeSharedNote(a, b);
    await signIn(page, a);
    const collab = collabLoadFor(page, id);
    await openAsOwner(page, id);
    await collab; // the editor is switching to the (not yet stored) doc right now
    const marker = `owner-now-${Date.now()}`;
    await typeAtEnd(page, page, ` ${marker}`);
    await expect(editorIn(page)).toContainText(`${SHARED_BODY} ${marker}`);

    await expect.poll(async () => (await serverNote(id)).content, { timeout: 20_000 }).toContain(marker);
    await expect.poll(async () => (await serverNote(id)).doc ?? "", { timeout: 20_000 }).toContain(marker);
    const s = await serverNote(id);
    expect(s.content).toContain(SHARED_BODY);
    expect(s.doc).toContain(SHARED_BODY);
  });

  test("owner: the doc load fails, typing goes on, and the stored doc is never replaced", async ({ page, context }) => {
    const [a, b] = seededAccounts();
    const { id } = await makeSharedNote(a, b);
    await signIn(page, a);
    await seedStoredDoc(context, id);

    let aborted = 0;
    await page.route("**/api/collab**", (route) => { aborted++; return route.abort(); });
    const collab = collabLoadFor(page, id);
    await openAsOwner(page, id);
    await collab;
    const marker = `owner-fail-${Date.now()}`;
    await typeAtEnd(page, page, ` ${marker}`);
    await expect(editorIn(page)).toContainText(`${SHARED_BODY} ${marker}`);

    // The text lands through the plain (conflict-checked) save; the shared doc
    // is untouched while it can't be loaded.
    await expect.poll(async () => (await serverNote(id)).content, { timeout: 20_000 }).toContain(marker);
    const during = await serverNote(id);
    expect(during.content).toContain(SHARED_BODY);
    expect(during.doc).toContain(SHARED_BODY);
    expect(during.doc).not.toContain(marker);
    expect(aborted).toBeGreaterThan(0);

    // Load works again: the retry joins the doc and carries the edit into it.
    await page.unroute("**/api/collab**");
    await expect.poll(async () => (await serverNote(id)).doc ?? "", { timeout: 30_000 }).toContain(marker);
    const after = await serverNote(id);
    expect(after.doc).toContain(SHARED_BODY);
    expect(after.content).toContain(`${SHARED_BODY} ${marker}`);
  });

  test("recipient: typing as soon as the note appears", async ({ page }) => {
    const [a, b] = seededAccounts();
    const { id, shortcode } = await makeSharedNote(a, b);
    await signIn(page, b);
    const view = await openAsRecipient(page, shortcode);
    const marker = `recipient-now-${Date.now()}`;
    await typeAtEnd(page, view, ` ${marker}`);
    await expect(editorIn(view)).toContainText(`${SHARED_BODY} ${marker}`);

    await expect.poll(async () => (await serverNote(id)).content, { timeout: 20_000 }).toContain(marker);
    await expect.poll(async () => (await serverNote(id)).doc ?? "", { timeout: 20_000 }).toContain(marker);
    const s = await serverNote(id);
    expect(s.content).toContain(SHARED_BODY);
    expect(s.doc).toContain(SHARED_BODY);
  });

  test("recipient: the doc load fails — locked, never replaces the doc, then edits once it loads", async ({ page, context }) => {
    const [a, b] = seededAccounts();
    const { id, shortcode } = await makeSharedNote(a, b);
    // A opens it first (stores the doc), in its own context.
    const owner = await context.browser()!.newContext();
    await signIn(owner, a);
    await seedStoredDoc(owner, id);
    await owner.close();

    await signIn(page, b);
    await page.route("**/api/collab**", (route) => route.abort());
    const view = await openAsRecipient(page, shortcode);
    await expect(editorIn(view)).toContainText(SHARED_BODY);
    // Can't be edited while the doc can't load: typing has nowhere to go.
    await expect(editorIn(view)).toHaveAttribute("contenteditable", "false");
    const lost = `recipient-blocked-${Date.now()}`;
    await typeAtEnd(page, view, ` ${lost}`);
    await page.waitForTimeout(2500);
    const during = await serverNote(id);
    expect(during.content).toBe(SHARED_BODY);
    expect(during.doc).toContain(SHARED_BODY);
    expect(during.doc).not.toContain(lost);

    // The load works again: the retry binds the doc and the editor unlocks.
    await page.unroute("**/api/collab**");
    await expect(editorIn(view)).toHaveAttribute("contenteditable", "true", { timeout: 40_000 });
    const marker = `recipient-after-${Date.now()}`;
    await typeAtEnd(page, view, ` ${marker}`);
    await expect.poll(async () => (await serverNote(id)).doc ?? "", { timeout: 20_000 }).toContain(marker);
    await expect.poll(async () => (await serverNote(id)).content, { timeout: 20_000 }).toContain(marker);
    const after = await serverNote(id);
    expect(after.doc).toContain(SHARED_BODY);
    expect(after.content).toContain(SHARED_BODY);
  });

  test("owner and recipient editing at the same time (one offline): both edits survive", async ({ page, context }) => {
    const [a, b] = seededAccounts();
    const { id, shortcode } = await makeSharedNote(a, b, { body: `First line.\n\n${SHARED_BODY}` });
    await signIn(page, a);
    const other = await context.browser()!.newContext();
    await signIn(other, b);
    const pageB = await other.newPage();

    await openAsOwner(page, id);
    const viewB = await openAsRecipient(pageB, shortcode);
    await expect(editorIn(viewB)).toContainText(SHARED_BODY);
    await page.waitForTimeout(2500); // both bound to the doc

    // Truly concurrent: B edits offline (nothing reaches A or the server) while
    // A edits online, each from the same doc, in different paragraphs.
    const ma = `from-A-${Date.now()}`;
    const mb = `from-B-${Date.now()}`;
    const typeAtEndOf = async (p: Page, scope: Page | ReturnType<Page["locator"]>, line: string, text: string) => {
      await editorIn(scope).locator("p", { hasText: line }).click();
      await p.keyboard.press("End");
      await p.keyboard.type(text);
    };
    await other.setOffline(true);
    await Promise.all([typeAtEndOf(pageB, viewB, "First line.", ` ${mb}`), typeAtEndOf(page, page, SHARED_BODY, ` ${ma}`)]);
    await expect.poll(async () => (await serverNote(id)).doc ?? "", { timeout: 20_000 }).toContain(ma);
    expect((await serverNote(id)).doc).not.toContain(mb);
    await other.setOffline(false);

    // Merged: in the stored doc, in the note's content, and in both editors.
    for (const m of [ma, mb]) {
      await expect.poll(async () => (await serverNote(id)).doc ?? "", { timeout: 30_000 }).toContain(m);
      await expect.poll(async () => (await serverNote(id)).content, { timeout: 30_000 }).toContain(m);
    }
    const s = await serverNote(id);
    expect(s.content).toContain(`First line. ${mb}`);
    expect(s.content).toContain(`${SHARED_BODY} ${ma}`);
    await expect(editorIn(page)).toContainText(mb);
    await expect(editorIn(viewB)).toContainText(ma);
    await other.close();
  });

  test("a save that removes most of the note puts the old body in Version history first", async ({ page }) => {
    const [a, b] = seededAccounts();
    const long = `${SHARED_BODY} ${"Lorem ipsum dolor sit amet. ".repeat(20)}`.trim(); // ~600 chars
    const { id } = await makeSharedNote(a, b, { share: false, body: long });
    await signIn(page, a);
    await page.goto(`${BASE_URL}/`);
    await page.locator(`[data-note-card="${id}"]`).click();
    await expect(editorIn(page)).toContainText("Lorem ipsum");
    await editorIn(page).click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("short now");
    await expect.poll(async () => (await serverNote(id)).content, { timeout: 20_000 }).toContain("short now");
    const v = await safetyVersions(id);
    expect(v).toHaveLength(1);
    expect(v[0].content).toBe(long);
    expect(v[0].author).toBe(a.id);
    await adminClient().from("note_versions").delete().eq("note_id", id);
  });
});
