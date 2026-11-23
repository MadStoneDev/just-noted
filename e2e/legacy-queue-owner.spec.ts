import type { Page } from "@playwright/test";
import { v4 as uuidv4 } from "uuid";
import { test, expect } from "./fixtures/no-conflicts";
import { seededAccounts, signIn, type SeededAccount } from "./fixtures/auth";
import { adminClient } from "./fixtures/admin";

// Offline-queue entries left by older builds carry the DEVICE id (or nothing)
// instead of the account they belong to. The device id is shared by every
// account on the device, so such an entry must not be replayed by whoever signs
// in next: only by the account that owns its note — the server's word (the
// session can read the note), or the cached copy's account. Owner unknown, or
// another account: it stays parked.
//
// One device, accounts A and B. Planted before the app first loads, all tagged
// with the device id, all edits of notes created up front:
//   onlyA   A's note, nothing cached
//   onlyB   B's note, nothing cached
//   sharedA A's note shared with B (edit): B may write it, but it isn't B's
//   cachedA A's note, its cached copy tagged with A
//   missing no such note anywhere, nothing cached
// B signs in first: only onlyB lands. Then A: onlyA, sharedA, cachedA land.
// `missing` is never sent and stays queued under the device id.

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3050";

const norm = (s: string | null | undefined) => (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();

async function serverContent(noteId: string): Promise<string | null> {
  const { data } = await adminClient().from("notes").select("content").eq("id", noteId).maybeSingle();
  return (data as { content: string } | null)?.content ?? null;
}

async function createNote(owner: SeededAccount, content: string): Promise<string> {
  const at = new Date(Date.now() - 3_600_000).toISOString(); // well before the entries were queued
  const { data, error } = await adminClient()
    .from("notes")
    .insert({ author: owner.id, title: "legacy owner probe", content, created_at: at, updated_at: at })
    .select("id")
    .single();
  expect(error).toBeNull();
  return (data as { id: string }).id;
}

async function shareWith(noteId: string, owner: SeededAccount, reader: SeededAccount) {
  const { data: share, error } = await adminClient()
    .from("shared_notes")
    .insert({
      note_id: noteId,
      note_owner_id: owner.id,
      shortcode: `lq${Math.random().toString(36).slice(2, 10)}`,
      is_public: false,
      is_anonymous: false,
      storage: "supabase",
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  const { error: rErr } = await adminClient()
    .from("shared_notes_readers")
    .insert({ shared_note: (share as { id: string }).id, reader_id: reader.id, reader_username: reader.handle, role: "edit" });
  expect(rErr).toBeNull();
}

interface Planted {
  queue: { noteId: string; content: string }[];
  cached: { id: string; content: string; account: string }[];
  device: string;
}

/** Write IndexedDB as an older build left it, on the app's origin, before the app runs. */
async function plant(page: Page, p: Planted) {
  await page.goto(`${BASE_URL}/robots.txt`);
  await page.evaluate(async ({ queue, cached, device }) => {
    localStorage.setItem("notes_user_id", device);
    const open = (name: string, upgrade: (db: IDBDatabase) => void) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(name, 1);
        r.onupgradeneeded = () => upgrade(r.result);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    const put = (db: IDBDatabase, store: string, rows: unknown[]) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        for (const row of rows) tx.objectStore(store).put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    const q = await open("OfflineQueueDB", (db) => {
      const s = db.createObjectStore("operations", { keyPath: "id" });
      s.createIndex("noteId", "payload.noteId", { unique: false });
    });
    const now = Date.now();
    await put(
      q,
      "operations",
      queue.map((e, i) => ({
        id: `op_${now + i}_legacy${i}`,
        // An older build's entry: device id, no baseVersion (CAS on the time queued).
        payload: { type: "update", noteId: e.noteId, source: "supabase", userId: device, content: e.content, goal: 0, goalType: "" },
        timestamp: now + i,
        retryCount: 0,
        lastAttempt: null,
      })),
    );
    q.close();
    const c = await open("NotesCacheDB", (db) => db.createObjectStore("notes", { keyPath: "id" }));
    await put(
      c,
      "notes",
      cached.map((n) => ({
        id: n.id,
        account: n.account,
        author: device,
        source: "supabase",
        title: "legacy owner probe",
        content: n.content,
        contentFormat: "markdown",
        createdAt: now - 60_000,
        updatedAt: now - 60_000,
        version: 1,
        isPinned: false,
        isPrivate: false,
        isCollapsed: false,
        order: 0,
        goal: 0,
        goal_type: "",
        notebookId: null,
        deletedAt: null,
      })),
    );
    c.close();
  }, p);
}

async function queuedFor(page: Page): Promise<Map<string, string>> {
  const rows = await page.evaluate(
    () =>
      new Promise<{ noteId: string; userId: string }[]>((resolve) => {
        const req = indexedDB.open("OfflineQueueDB");
        req.onsuccess = () => {
          const db = req.result;
          const all = db.transaction("operations", "readonly").objectStore("operations").getAll();
          all.onsuccess = () => {
            resolve((all.result as { payload: { noteId: string; userId: string } }[]).map((o) => o.payload));
            db.close();
          };
        };
        req.onerror = () => resolve([]);
      }),
  );
  return new Map(rows.map((r) => [r.noteId, r.userId]));
}

/** Load the app with `decoy` open: an open editor holds its note's queued entries. */
async function openApp(page: Page, decoy: string) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "All Notes" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('button[aria-label="Account"]:visible').first()).toBeVisible();
  await page.locator(`[data-note-card="${decoy}"]`).click();
  await expect(page.locator(`[data-note-card="${decoy}"]`)).toHaveAttribute("data-active", "true");
}

test("legacy device-id queue entries replay only for the account that owns the note", async ({ page }) => {
  test.skip(seededAccounts().length < 2, "needs both seeded accounts (service-role key)");
  test.setTimeout(150_000);
  const [accA, accB] = seededAccounts();
  const DEVICE = uuidv4();

  const onlyA = await createNote(accA, "A original");
  const onlyB = await createNote(accB, "B original");
  const sharedA = await createNote(accA, "shared original");
  await shareWith(sharedA, accA, accB);
  const cachedA = await createNote(accA, "cached original");
  const missing = uuidv4();
  const [decoyA, decoyB] = [await createNote(accA, "A decoy"), await createNote(accB, "B decoy")];
  const created = [onlyA, onlyB, sharedA, cachedA, decoyA, decoyB];

  try {
    await plant(page, {
      device: DEVICE,
      queue: [
        { noteId: onlyA, content: "A legacy edit" },
        { noteId: onlyB, content: "B legacy edit" },
        { noteId: sharedA, content: "shared legacy edit" },
        { noteId: cachedA, content: "cached legacy edit" },
        { noteId: missing, content: "orphan legacy edit" },
      ],
      cached: [{ id: cachedA, content: "cached legacy edit", account: accA.id }],
    });

    // ── B signs in first (A also on the device) ──
    await signIn(page, accB, { alsoOnDevice: [accA] });
    await openApp(page, decoyB);
    await expect.poll(async () => norm(await serverContent(onlyB)), { timeout: 20_000 }).toBe("B legacy edit");
    await page.waitForTimeout(3000); // the rest had every chance to go out
    expect(norm(await serverContent(onlyA)), "A's note untouched under B").toBe("A original");
    expect(norm(await serverContent(sharedA)), "A's shared note untouched under B (B can write it, but it isn't B's)").toBe("shared original");
    expect(norm(await serverContent(cachedA)), "A's cached note untouched under B").toBe("cached original");
    let q = await queuedFor(page);
    expect(q.has(onlyB), "B's entry sent").toBe(false);
    expect(q.get(onlyA), "owner unknown to B: stays untagged").toBe(DEVICE);
    expect(q.get(sharedA), "owner unknown to B: stays untagged").toBe(DEVICE);
    expect(q.get(cachedA), "cached copy says A: parked under A").toBe(accA.id);
    expect(q.get(missing)).toBe(DEVICE);

    // ── Switch to A ──
    await page.context().clearCookies();
    await signIn(page, accA);
    await openApp(page, decoyA);
    await expect.poll(async () => norm(await serverContent(onlyA)), { timeout: 20_000 }).toBe("A legacy edit");
    await expect.poll(async () => norm(await serverContent(sharedA)), { timeout: 20_000 }).toBe("shared legacy edit");
    await expect.poll(async () => norm(await serverContent(cachedA)), { timeout: 20_000 }).toBe("cached legacy edit");
    expect(norm(await serverContent(onlyB)), "B's note keeps B's edit").toBe("B legacy edit");
    await expect.poll(async () => [...(await queuedFor(page)).keys()], { timeout: 10_000 }).toEqual([missing]);
    q = await queuedFor(page);
    expect(q.get(missing), "owner never known: still parked, untagged").toBe(DEVICE);
  } finally {
    await adminClient().from("notes").delete().in("id", created);
  }
});
