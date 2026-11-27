import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Y from "yjs";

// lib/collab-lifecycle.ts against an in-memory service-role client: when the
// stored Yjs doc is kept, marked current, or dropped.

type Row = Record<string, any>;
let tables: Record<string, Row[]> = {};

function from(table: string) {
  tables[table] ??= [];
  const filters: ((r: Row) => boolean)[] = [];
  let op: { kind: "select" | "update" | "delete" | "insert"; values?: Row } = { kind: "select" };
  let limit = Infinity;
  const run = () => {
    const rows = tables[table].filter((r) => filters.every((f) => f(r)));
    if (op.kind === "update") rows.forEach((r) => Object.assign(r, op.values));
    if (op.kind === "delete") tables[table] = tables[table].filter((r) => !rows.includes(r));
    if (op.kind === "insert") tables[table].push({ ...op.values });
    return rows.slice(0, limit);
  };
  const b: any = {
    select: () => b,
    eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
    in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(r[c])), b),
    limit: (n: number) => ((limit = n), b),
    update: (values: Row) => ((op = { kind: "update", values }), b),
    delete: () => ((op = { kind: "delete" }), b),
    insert: (values: Row) => ((op = { kind: "insert", values }), b),
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (resolve: (v: any) => void) => resolve({ data: run(), error: null }),
  };
  return b;
}

vi.mock("@/utils/supabase/server", () => ({ createServiceRoleClient: () => ({ from }) }));

const { afterOwnerContentSave, dropCollabDocIfNotCollaborative, noteIsCollaborative, readCurrentCollabDoc } =
  await import("./collab-lifecycle");

const NOTE = "11111111-1111-4111-8111-111111111111";
const BODY = "Shared with B for collaboration specs.";

function docState(text: string): string {
  const d = new Y.Doc();
  const p = new Y.XmlElement("paragraph");
  const t = new Y.XmlText();
  t.insert(0, text);
  p.insert(0, [t]);
  d.getXmlFragment("prosemirror").insert(0, [p]);
  return Buffer.from(Y.encodeStateAsUpdate(d)).toString("base64");
}

const hour = 3_600_000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

function setup(opts: { link?: string; editor?: boolean; share?: boolean; docAgo?: number; noteAgo?: number; content?: string }) {
  tables = {
    shared_notes: opts.share === false ? [] : [{ id: "s1", note_id: NOTE, link_permission: opts.link ?? "view" }],
    shared_notes_readers: opts.editor ? [{ id: "r1", shared_note: "s1", role: "edit" }] : [{ id: "r2", shared_note: "s1", role: "view" }],
    note_ydoc: [{ note_id: NOTE, state: docState(BODY), updated_at: iso(opts.docAgo ?? hour) }],
    notes: [{ id: NOTE, author: "owner", title: "T", content: opts.content ?? BODY, updated_at: iso(opts.noteAgo ?? hour), version: 3 }],
    note_versions: [],
  };
}

beforeEach(() => {
  tables = {};
});

describe("is the note collaborative (anyone else can edit)", () => {
  it("a 'Can edit' link or a person with edit: yes", async () => {
    setup({ link: "edit" });
    expect(await noteIsCollaborative({ from } as any, NOTE)).toBe(true);
    setup({ editor: true });
    expect(await noteIsCollaborative({ from } as any, NOTE)).toBe(true);
  });
  it("view-only, or not shared at all: no", async () => {
    setup({});
    expect(await noteIsCollaborative({ from } as any, NOTE)).toBe(false);
    setup({ share: false });
    expect(await noteIsCollaborative({ from } as any, NOTE)).toBe(false);
  });
});

describe("unsharing", () => {
  it("drops the doc once no edit access is left", async () => {
    setup({ link: "off" });
    await dropCollabDocIfNotCollaborative(NOTE);
    expect(tables.note_ydoc).toHaveLength(0);
  });
  it("keeps it while someone can still edit", async () => {
    setup({ editor: true });
    await dropCollabDocIfNotCollaborative(NOTE);
    expect(tables.note_ydoc).toHaveLength(1);
  });
});

describe("after the owner's content save", () => {
  it("a save through the doc marks it current", async () => {
    setup({ editor: true, docAgo: hour });
    await afterOwnerContentSave(NOTE, true);
    expect(Date.now() - Date.parse(tables.note_ydoc[0].updated_at)).toBeLessThan(5_000);
  });
  it("a plain save on a collaborative note marks it current too (the editor carries the text in)", async () => {
    setup({ editor: true, docAgo: hour });
    await afterOwnerContentSave(NOTE, false);
    expect(tables.note_ydoc).toHaveLength(1);
    expect(Date.now() - Date.parse(tables.note_ydoc[0].updated_at)).toBeLessThan(5_000);
  });
  it("a plain save on a note no longer shared for editing drops the doc", async () => {
    setup({});
    await afterOwnerContentSave(NOTE, false);
    expect(tables.note_ydoc).toHaveLength(0);
  });
});

describe("load-time check", () => {
  it("a current doc loads as is", async () => {
    setup({ editor: true, docAgo: 1_000, noteAgo: 2_000, content: `${BODY} newer` });
    const r = await readCurrentCollabDoc({ from } as any, NOTE);
    expect(r).toEqual({ ok: true, state: tables.note_ydoc[0].state });
  });
  it("content saved well after the doc, with other words: discarded, its words kept in history", async () => {
    setup({ editor: true, docAgo: hour, noteAgo: 1_000, content: `${BODY} edited while unshared` });
    const r = await readCurrentCollabDoc({ from } as any, NOTE);
    expect(r).toEqual({ ok: true, state: null });
    expect(tables.note_ydoc).toHaveLength(0);
    expect(tables.note_versions).toEqual([
      expect.objectContaining({ note_id: NOTE, author: "owner", content: BODY, reason: "safety" }),
    ]);
  });
  it("only the title changed since (same words): kept", async () => {
    setup({ editor: true, docAgo: hour, noteAgo: 1_000, content: BODY });
    const r = await readCurrentCollabDoc({ from } as any, NOTE);
    expect(r.ok && r.state).toBeTruthy();
    expect(tables.note_versions).toHaveLength(0);
  });
});
