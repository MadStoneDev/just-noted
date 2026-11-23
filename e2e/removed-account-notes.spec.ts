import type { Page } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";
import { test, expect } from "./fixtures/no-conflicts";
import { seededAccounts, signIn, type SeededAccount } from "./fixtures/auth";
import { adminClient } from "./fixtures/admin";

// Settings → Sync & data: an account removed from this device leaves its
// unsynced edits parked (they'd sync if it came back). The section says how
// many and offers Discard, behind a confirm. Nothing is deleted by itself.
//
// A is signed in, B is also on the device and has an unsynced edit parked
// (queued for B + B's unsynced cached copy). Nothing shows while B is on the
// device. Remove B: "1 unsynced note from a removed account". It survives a
// reload; Cancel keeps it; Discard (confirmed) drops B's entry and cached copy
// only. B's note on the server is untouched throughout.

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3050";
const SYNC_DATA = "/settings?section=Sync%20%26%20data";
const ACCOUNT = "/settings?section=Account";

async function serverContent(noteId: string): Promise<string | null> {
  const { data } = await adminClient().from("notes").select("content").eq("id", noteId).maybeSingle();
  return (data as { content: string } | null)?.content ?? null;
}

/** B's unsynced edit, as the app leaves it on a sign-out: queued for B, cached as B's. */
async function parkFor(page: Page, owner: SeededAccount, noteId: string, text: string) {
  await page.goto(`${BASE_URL}/robots.txt`);
  await page.evaluate(
    async ({ owner, noteId, text, device }) => {
      localStorage.setItem("notes_user_id", device);
      const open = (name: string, upgrade: (db: IDBDatabase) => void) =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const r = indexedDB.open(name, 1);
          r.onupgradeneeded = () => upgrade(r.result);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
      const put = (db: IDBDatabase, store: string, row: unknown) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(store, "readwrite");
          tx.objectStore(store).put(row);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      const now = Date.now();
      const q = await open("OfflineQueueDB", (db) => {
        const s = db.createObjectStore("operations", { keyPath: "id" });
        s.createIndex("noteId", "payload.noteId", { unique: false });
      });
      await put(q, "operations", {
        id: `op_${now}_parked`,
        payload: { type: "update", noteId, source: "supabase", userId: owner, content: text, goal: 0, goalType: "", baseVersion: 1 },
        timestamp: now,
        retryCount: 0,
        lastAttempt: null,
      });
      q.close();
      const c = await open("NotesCacheDB", (db) => db.createObjectStore("notes", { keyPath: "id" }));
      await put(c, "notes", {
        id: noteId,
        account: owner,
        author: owner,
        source: "supabase",
        title: "parked",
        content: text,
        contentFormat: "markdown",
        createdAt: now - 60_000,
        updatedAt: now,
        version: 1,
        localEdit: now,
        isPinned: false,
        isPrivate: false,
        isCollapsed: false,
        order: 0,
        goal: 0,
        goal_type: "",
        notebookId: null,
        deletedAt: null,
      });
      c.close();
    },
    { owner: owner.id, noteId, text, device: uuidv4() },
  );
}

async function idbState(page: Page, noteId: string): Promise<{ queued: string[]; cached: boolean }> {
  return page.evaluate(async (id) => {
    const read = (name: string, store: string) =>
      new Promise<any[]>((resolve) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains(store)) { db.close(); resolve([]); return; }
          const all = db.transaction(store, "readonly").objectStore(store).getAll();
          all.onsuccess = () => { resolve(all.result); db.close(); };
          all.onerror = () => { resolve([]); db.close(); };
        };
        r.onerror = () => resolve([]);
      });
    const ops = await read("OfflineQueueDB", "operations");
    const notes = await read("NotesCacheDB", "notes");
    return {
      queued: ops.filter((o) => o.payload?.noteId === id).map((o) => o.payload.userId as string),
      cached: notes.some((n) => n.id === id),
    };
  }, noteId);
}

const section = (page: Page) => page.getByTestId("removed-account-notes");

test("a removed account's unsynced notes: shown in Sync & data, discarded only after a confirm", async ({ page }) => {
  test.skip(seededAccounts().length < 2, "needs both seeded accounts (service-role key)");
  test.setTimeout(120_000);
  const [accA, accB] = seededAccounts();

  const { data, error } = await adminClient()
    .from("notes")
    .insert({ author: accB.id, title: "parked", content: "B on the server" })
    .select("id")
    .single();
  expect(error).toBeNull();
  const noteId = (data as { id: string }).id;

  try {
    await parkFor(page, accB, noteId, "B unsynced edit");
    await signIn(page, accA, { alsoOnDevice: [accB] });

    // B still on the device: nothing to show.
    await page.goto(SYNC_DATA);
    await expect(page.getByText("Trash retention")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await expect(section(page)).toHaveCount(0);
    expect((await idbState(page, noteId)).queued, "parked for B").toEqual([accB.id]);

    // Remove B from the device.
    await page.goto(ACCOUNT);
    const row = page.locator("div").filter({ hasText: `@${accB.handle}` }).filter({ has: page.getByTitle("Remove from this device") }).last();
    await row.getByTitle("Remove from this device").click();
    await expect(page.getByText(`@${accB.handle}`)).toHaveCount(0);

    await page.goto(SYNC_DATA);
    await expect(section(page)).toContainText("1 unsynced note from a removed account", { timeout: 15_000 });

    // Never deleted by itself: a reload later it's all still there.
    await page.reload();
    await expect(section(page)).toContainText("1 unsynced note from a removed account", { timeout: 15_000 });
    expect(await idbState(page, noteId)).toEqual({ queued: [accB.id], cached: true });

    // Discard asks first; Cancel keeps everything.
    await section(page).getByRole("button", { name: "Discard", exact: true }).click();
    const confirm = page.getByRole("alertdialog", { name: "Discard unsynced notes" });
    await expect(confirm).toContainText("Discard 1 unsynced note? This can't be undone.");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toHaveCount(0);
    expect(await idbState(page, noteId)).toEqual({ queued: [accB.id], cached: true });

    // Confirmed: B's entry and cached copy go; the section with them.
    await section(page).getByRole("button", { name: "Discard", exact: true }).click();
    await confirm.getByRole("button", { name: "Discard 1 unsynced note" }).click();
    await expect(section(page)).toHaveCount(0);
    expect(await idbState(page, noteId)).toEqual({ queued: [], cached: false });

    // Discarding is local: B's note on the server never changed.
    expect(await serverContent(noteId)).toBe("B on the server");
  } finally {
    await adminClient().from("notes").delete().eq("id", noteId);
  }
});
