// Queued / tab-close edits vs a newer edit from another device. Runs the REAL
// offline queue (fake-indexeddb), the REAL updateNote server action and the REAL
// /api/notes/leave-save route against an in-memory Supabase "notes" table, and
// the REAL Redis CAS against an in-memory hash. Rule under test (Phase 2): a
// background write never overwrites a newer server version — the server note
// stays as it is and the queued text becomes ONE "(conflicted copy)".
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── In-memory Supabase ───────────────────────────────────────────────────────
type Row = Record<string, any>;
const db = { notes: new Map<string, Row>() };
const USER = "user-1";

function fakeSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
    from(table: string) {
      if (table !== "notes") throw new Error(`unexpected table ${table}`);
      const filters: [string, unknown][] = [];
      let op: "select" | "update" = "select";
      let patch: Row = {};
      const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
      const b: any = {
        select: () => b,
        eq: (k: string, v: unknown) => (filters.push([k, v]), b),
        update: (p: Row) => ((op = "update"), (patch = p), b),
        insert: async (row: Row) => {
          if (db.notes.has(row.id)) return { error: { code: "23505", message: "duplicate key" } };
          db.notes.set(row.id, { deleted_at: null, ...row });
          return { error: null };
        },
        maybeSingle: async () => {
          const hit = [...db.notes.values()].find(match);
          if (!hit) return { data: null, error: null };
          if (op === "update") Object.assign(hit, patch);
          return { data: { ...hit }, error: null };
        },
      };
      return b;
    },
  };
}

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => fakeSupabase(),
  createServiceRoleClient: () => fakeSupabase(),
}));
// The queue imports Redis note ops too; only cloud notes are exercised here.
vi.mock("@/app/actions/notes", () => ({
  noteOperation: vi.fn(async () => ({ success: true })),
  fetchNotesRevision: vi.fn(async () => ({ success: true, revision: 0 })),
}));

// ── In-memory Redis (only what casUpdateNote touches) ────────────────────────
const hash = new Map<string, Map<string, string>>();
const field = (k: string) => hash.get(k) ?? hash.set(k, new Map()).get(k)!;
vi.mock("@/lib/redis", () => {
  const redis = {
    type: async (k: string) => (hash.has(k) ? "hash" : "none"),
    hget: async (k: string, f: string) => field(k).get(f) ?? null,
    hexists: async (k: string, f: string) => (field(k).has(f) ? 1 : 0),
    incr: async () => 1,
    // CAS_LUA: set field only if unchanged; optional extra (copy) field.
    // ioredis signature: eval(script, numkeys, ...keys, ...argv).
    eval: async (_script: string, _n: number, k: string, f: string, expected: string, next: string, copyF: string, copyV: string) => {
      if (field(k).get(f) !== expected) return 0;
      if (copyF) field(k).set(copyF, copyV);
      field(k).set(f, next);
      return 1;
    },
  };
  return { redis };
});

import { enqueue, processQueue, clearQueue } from "./offline-queue";
import { setActiveSupabaseUser } from "./offline-queue-guard";
import { updateNote } from "@/app/actions/supabaseActions";
import { POST as leaveSave } from "@/app/api/notes/leave-save/route";
import { casUpdateNote } from "@/utils/redis/note-store";
import { decideBackgroundWrite } from "./background-conflict";
import { reconcileNotes } from "./notes-merge";

const NOTE = "note-1";

function seedCloud(content: string, version: number) {
  db.notes.clear();
  db.notes.set(NOTE, {
    id: NOTE,
    author: USER,
    title: "Shopping",
    content,
    content_format: "markdown",
    goal: 0,
    goal_type: "",
    is_private: true,
    order: 2,
    notebook_id: null,
    version,
    deleted_at: null,
  });
}

const copies = () => [...db.notes.values()].filter((r) => r.id !== NOTE);

const queueEdit = (content: string, baseVersion: number) =>
  enqueue({
    type: "update",
    noteId: NOTE,
    source: "supabase",
    userId: USER,
    content,
    goal: 0,
    goalType: "",
    baseVersion,
  });

beforeEach(async () => {
  vi.stubGlobal("navigator", { onLine: true });
  await clearQueue();
  setActiveSupabaseUser(USER);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("queued edit replay (Supabase)", () => {
  it("vs a newer remote edit → conflicted copy; server content intact", async () => {
    seedCloud("milk", 3);
    await queueEdit("milk, eggs (typed before the tab closed)", 3);
    // Another device saves first.
    db.notes.get(NOTE)!.content = "milk, bread (other device)";
    db.notes.get(NOTE)!.version = 4;

    await processQueue();

    const server = db.notes.get(NOTE)!;
    expect(server.content).toBe("milk, bread (other device)");
    expect(server.version).toBe(4);
    const [copy, ...more] = copies();
    expect(more).toHaveLength(0);
    expect(copy.content).toBe("milk, eggs (typed before the tab closed)");
    expect(copy.title).toMatch(/^Shopping \(conflicted copy, .+\)$/);
    expect(copy).toMatchObject({ author: USER, version: 1, is_private: true, deleted_at: null });
  });

  it("with no remote change → saved normally, no copy", async () => {
    seedCloud("milk", 3);
    await queueEdit("milk, eggs", 3);
    await processQueue();
    expect(db.notes.get(NOTE)).toMatchObject({ content: "milk, eggs", version: 4 });
    expect(copies()).toHaveLength(0);
  });

  it("server already holds the same text (moved on) → no copy, no write", async () => {
    seedCloud("milk, eggs\n", 5);
    await queueEdit("milk, eggs", 3);
    await processQueue();
    expect(db.notes.get(NOTE)).toMatchObject({ content: "milk, eggs\n", version: 5 });
    expect(copies()).toHaveLength(0);
  });

  it("note deleted elsewhere → server row untouched, text kept as a copy", async () => {
    seedCloud("milk", 3);
    await queueEdit("milk, eggs", 3);
    Object.assign(db.notes.get(NOTE)!, { deleted_at: "2026-11-11T00:00:00Z", version: 4 });
    await processQueue();
    expect(db.notes.get(NOTE)).toMatchObject({ content: "milk", deleted_at: "2026-11-11T00:00:00Z" });
    expect(copies().map((c) => c.content)).toEqual(["milk, eggs"]);
  });

  it("a retried replay of the same edit makes only one copy", async () => {
    seedCloud("remote", 4);
    const opts = { baseVersion: 3, conflictCopy: { id: "11111111-1111-4111-8111-111111111111", stamp: "11 Nov" } };
    const a = await updateNote(NOTE, "queued", 0, "", opts);
    const b = await updateNote(NOTE, "queued", 0, "", opts);
    expect(a).toMatchObject({ success: true, conflicted: true });
    expect(b).toMatchObject({ success: true, conflicted: true });
    expect(copies()).toHaveLength(1);
    expect(db.notes.get(NOTE)!.content).toBe("remote");
  });
});

describe("tab-close keepalive save (/api/notes/leave-save)", () => {
  const post = (body: unknown) =>
    leaveSave(
      new Request("http://localhost/api/notes/leave-save", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost" },
        body: JSON.stringify(body),
      }),
    );
  const COPY_ID = "22222222-2222-4222-8222-222222222222";

  it("vs a newer remote edit → copy; and the queue replay of the same edit adds no second copy", async () => {
    seedCloud("remote edit", 4);
    const res = await post({
      noteId: NOTE, content: "typed before close", goal: 0, goalType: "",
      baseVersion: 3, copyId: COPY_ID, copyStamp: "11 Nov, 10:00 am",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, conflicted: true });
    expect(db.notes.get(NOTE)).toMatchObject({ content: "remote edit", version: 4 });

    // The offline-queue entry written in the same flush (same copy id).
    await enqueue({
      type: "update", noteId: NOTE, source: "supabase", userId: USER,
      content: "typed before close", goal: 0, goalType: "", baseVersion: 3, copyId: COPY_ID,
    });
    await processQueue();
    expect(copies().map((c) => c.id)).toEqual([COPY_ID]);
    expect(db.notes.get(NOTE)!.content).toBe("remote edit");
  });

  it("with no remote change → saved normally", async () => {
    seedCloud("before", 3);
    const res = await post({
      noteId: NOTE, content: "before + after", goal: 0, goalType: "",
      baseVersion: 3, copyId: COPY_ID, copyStamp: "11 Nov",
    });
    expect(await res.json()).toMatchObject({ success: true, conflicted: false, version: 4 });
    expect(db.notes.get(NOTE)!.content).toBe("before + after");
    expect(copies()).toHaveLength(0);
  });

  it("refuses a request without a valid copy id (no unguarded write)", async () => {
    seedCloud("before", 3);
    const res = await post({ noteId: NOTE, content: "x", baseVersion: 3 });
    expect(res.status).toBe(400);
    expect(db.notes.get(NOTE)!.content).toBe("before");
  });
});

describe("queued edit replay (Redis CAS)", () => {
  const KEY = "notes:anon-1";
  const seed = (content: string, version: number) => {
    hash.clear();
    field(KEY).set(NOTE, JSON.stringify({ id: NOTE, title: "Ideas", content, version }));
  };
  const read = (id: string) => JSON.parse(field(KEY).get(id)!);
  const spec = { id: "33333333-3333-4333-8333-333333333333", stamp: "11 Nov" };
  const patch = (content: string) => ({ content, goal: 0, goalType: "" as const });

  it("vs a newer remote edit → copy; stored note untouched", async () => {
    seed("remote", 4);
    const r = await casUpdateNote("anon-1", NOTE, patch("queued"), 3, spec);
    expect(r).toMatchObject({ success: true, conflicted: true, version: 4 });
    expect(read(NOTE)).toMatchObject({ content: "remote", version: 4 });
    expect(read(spec.id)).toMatchObject({ content: "queued", version: 1 });
    expect(read(spec.id).title).toMatch(/^Ideas \(conflicted copy, 11 Nov\)$/);
    await casUpdateNote("anon-1", NOTE, patch("queued"), 3, spec); // retry
    expect(field(KEY).size).toBe(2);
  });

  it("with no remote change → saved normally", async () => {
    seed("old", 3);
    const r = await casUpdateNote("anon-1", NOTE, patch("old + new"), 3, spec);
    expect(r).toMatchObject({ success: true, conflicted: false, version: 4 });
    expect(read(NOTE)).toMatchObject({ content: "old + new", version: 4 });
    expect(field(KEY).size).toBe(1);
  });
});

describe("decideBackgroundWrite", () => {
  const d = (baseVersion: number, serverVersion: number, serverContent: string, content: string, serverDeleted = false) =>
    decideBackgroundWrite({ baseVersion, serverVersion, serverContent, content, serverDeleted });
  it("applies on a matching base", () => expect(d(3, 3, "a", "b")).toBe("apply"));
  it("copies when the server moved on with other text", () => expect(d(3, 4, "a", "b")).toBe("copy"));
  it("no-op when the server already has the text", () => expect(d(3, 4, "b\n", "b")).toBe("noop"));
  it("copies onto a deleted note, never applies", () => expect(d(3, 3, "a", "b", true)).toBe("copy"));
});

// ── Queue entries from an older build (no base version) ─────────────────────
// They CAS on the time they were queued: server changed after → copy.

/** Write a queue entry exactly as an older build stored it (no base, no copy id). */
async function putLegacyOp(content: string, queuedAt: number) {
  const { OFFLINE_QUEUE_DB_NAME, OFFLINE_QUEUE_DB_VERSION, OFFLINE_QUEUE_STORE_NAME } = await import(
    "@/constants/app"
  );
  const idb = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(OFFLINE_QUEUE_DB_NAME, OFFLINE_QUEUE_DB_VERSION);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(OFFLINE_QUEUE_STORE_NAME, "readwrite");
    tx.objectStore(OFFLINE_QUEUE_STORE_NAME).put({
      id: `op_${queuedAt}_legacy`,
      payload: { type: "update", noteId: NOTE, source: "supabase", userId: USER, content, goal: 0, goalType: "" },
      timestamp: queuedAt,
      retryCount: 0,
      lastAttempt: null,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  idb.close();
}

describe("legacy queue entry replay (Supabase)", () => {
  const QUEUED = Date.parse("2026-11-10T09:00:00Z");

  it("server changed AFTER the entry was queued → conflicted copy; server intact", async () => {
    seedCloud("other device's newer text", 6);
    db.notes.get(NOTE)!.updated_at = "2026-11-10T09:05:00Z";
    await putLegacyOp("text queued by the old build", QUEUED);

    await processQueue();

    expect(db.notes.get(NOTE)).toMatchObject({ content: "other device's newer text", version: 6 });
    expect(copies().map((c) => c.content)).toEqual(["text queued by the old build"]);
  });

  it("server unchanged since the entry was queued → saved normally, no copy", async () => {
    seedCloud("before", 6);
    db.notes.get(NOTE)!.updated_at = "2026-11-10T08:55:00Z";
    await putLegacyOp("before + queued", QUEUED);

    await processQueue();

    expect(db.notes.get(NOTE)).toMatchObject({ content: "before + queued", version: 7 });
    expect(copies()).toHaveLength(0);
  });

  it("server changed after, but already holds the same text → nothing written", async () => {
    seedCloud("same text\n", 6);
    db.notes.get(NOTE)!.updated_at = "2026-11-10T09:05:00Z";
    await putLegacyOp("same text", QUEUED);
    await processQueue();
    expect(db.notes.get(NOTE)).toMatchObject({ content: "same text\n", version: 6 });
    expect(copies()).toHaveLength(0);
  });

  it("server time unknown → treated as changed (copy, never an overwrite)", async () => {
    seedCloud("server text", 6); // no updated_at
    await putLegacyOp("queued", QUEUED);
    await processQueue();
    expect(db.notes.get(NOTE)!.content).toBe("server text");
    expect(copies().map((c) => c.content)).toEqual(["queued"]);
  });

  it("refuses a background write with neither a base version nor a queued time", async () => {
    seedCloud("before", 6);
    const r = await updateNote(NOTE, "x", 0, "", {
      conflictCopy: { id: "44444444-4444-4444-8444-444444444444", stamp: "11 Nov" },
    });
    expect(r).toMatchObject({ success: false, error: "Invalid data" });
    expect(db.notes.get(NOTE)!.content).toBe("before");
  });
});

describe("legacy queue entry replay (Redis CAS)", () => {
  const KEY = "notes:anon-1";
  const spec = { id: "55555555-5555-4555-8555-555555555555", stamp: "11 Nov" };
  const patch = (content: string) => ({ content, goal: 0, goalType: "" as const });
  const seed = (content: string, updatedAt: number) => {
    hash.clear();
    field(KEY).set(NOTE, JSON.stringify({ id: NOTE, title: "Ideas", content, version: 4, updatedAt }));
  };
  const read = (id: string) => JSON.parse(field(KEY).get(id)!);

  it("stored note changed after the entry was queued → copy; stored note untouched", async () => {
    seed("remote", 2_000);
    const r = await casUpdateNote("anon-1", NOTE, patch("queued"), undefined, spec, 1_000);
    expect(r).toMatchObject({ success: true, conflicted: true });
    expect(read(NOTE)).toMatchObject({ content: "remote", version: 4 });
    expect(read(spec.id)).toMatchObject({ content: "queued", version: 1 });
  });

  it("unchanged since queued → saved normally", async () => {
    seed("old", 1_000);
    const r = await casUpdateNote("anon-1", NOTE, patch("old + new"), undefined, spec, 2_000);
    expect(r).toMatchObject({ success: true, conflicted: false, version: 5 });
    expect(read(NOTE).content).toBe("old + new");
    expect(field(KEY).size).toBe(1);
  });
});

// ── Load-time reconcile push ─────────────────────────────────────────────────
// reconcileNotes decides; the push is the same background CAS write on the
// local copy's version (what use-notes-sync's pushNoteToServer sends).

describe("load reconcile push (Supabase)", () => {
  // A cached copy holding text typed on this device and not yet confirmed
  // (CombinedNote.localEdit) — the only kind the load reconcile pushes.
  const cached = (content: string, version: number, typedHere = true): any => ({
    id: NOTE, title: "Shopping", content, version, source: "supabase",
    createdAt: 0, updatedAt: 0, isPinned: false, isPrivate: true,
    ...(typedHere ? { localEdit: 1 } : {}),
  });
  const serverNote = () => {
    const r = db.notes.get(NOTE)!;
    return { ...cached(r.content, r.version, false), deletedAt: r.deleted_at };
  };
  const push = (n: any) =>
    updateNote(n.id, n.content, 0, "", {
      baseVersion: n.version,
      conflictCopy: { id: "66666666-6666-4666-8666-666666666666", stamp: "11 Nov" },
    });

  it("server at base → the unsynced cached edit is saved", async () => {
    seedCloud("milk", 3);
    const { toPush } = reconcileNotes([serverNote()], [cached("milk, eggs", 3)]);
    expect(toPush).toHaveLength(1);
    expect(await push(toPush[0])).toMatchObject({ success: true, version: 4 });
    expect(db.notes.get(NOTE)!.content).toBe("milk, eggs");
    expect(copies()).toHaveLength(0);
  });

  it("another save lands between reconcile and push → server kept, cached text is the copy", async () => {
    seedCloud("milk", 3);
    const { toPush } = reconcileNotes([serverNote()], [cached("milk, eggs", 3)]);
    Object.assign(db.notes.get(NOTE)!, { content: "milk, bread (other device)", version: 4 });
    expect(await push(toPush[0])).toMatchObject({ success: true, conflicted: true });
    expect(db.notes.get(NOTE)!.content).toBe("milk, bread (other device)");
    expect(copies().map((c) => c.content)).toEqual(["milk, eggs"]);
  });

  it("server moved on before load → no push at all; reconcile makes the copy", async () => {
    seedCloud("milk, bread (other device)", 5);
    const { toPush, toConflictCopy } = reconcileNotes([serverNote()], [cached("milk, eggs", 3)]);
    expect(toPush).toHaveLength(0);
    expect(toConflictCopy.map((n) => n.content)).toEqual(["milk, eggs"]);
  });
});

describe("decideBackgroundWrite — queued-time base (older queue entries)", () => {
  const d = (queuedAt: number, serverUpdatedAt: string | number | null, serverContent = "a", content = "b") =>
    decideBackgroundWrite({ base: { queuedAt }, serverVersion: 9, serverContent, serverUpdatedAt, content });
  const T = Date.parse("2026-11-10T09:00:00Z");
  it("applies when the server last changed before it was queued", () =>
    expect(d(T, "2026-11-10T08:59:59Z")).toBe("apply"));
  it("applies when the server last changed exactly when it was queued", () => expect(d(T, T)).toBe("apply"));
  it("copies when the server changed after it was queued", () =>
    expect(d(T, "2026-11-10T09:00:01Z")).toBe("copy"));
  it("no-op when the server changed after but has the same text", () =>
    expect(d(T, T + 1, "b\n", "b")).toBe("noop"));
  it("copies when the server time is unknown or unparseable", () => {
    expect(d(T, null)).toBe("copy");
    expect(d(T, "not a date")).toBe("copy");
  });
});
