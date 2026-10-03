import { vi, describe, it, expect, beforeEach } from "vitest";
import { noteIsTrashed } from "@/lib/note-trash";

// ── A tiny chainable Supabase fake ─────────────────────────────────────────
// Supports from(table).select().eq().eq().maybeSingle()/single()/limit().
function fakeSvc(tables: Record<string, any[]>) {
  const make = (table: string) => {
    let rows = [...(tables[table] || [])];
    const api: any = {
      select: () => api,
      eq: (col: string, val: any) => { rows = rows.filter((r) => r[col] === val); return api; },
      in: (col: string, vals: any[]) => { rows = rows.filter((r) => vals.includes(r[col])); return api; },
      order: () => api,
      limit: async () => ({ data: rows }),
      maybeSingle: async () => ({ data: rows[0] ?? null }),
      single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: "not found" } }),
    };
    return api;
  };
  return { from: make };
}

describe("noteIsTrashed (shared A4 gate)", () => {
  it("is true for a trashed note, false for a live one", async () => {
    const svc = fakeSvc({ notes: [{ id: "live", deleted_at: null }, { id: "dead", deleted_at: "2026-10-03T00:00:00Z" }] });
    expect(await noteIsTrashed(svc, "live")).toBe(false);
    expect(await noteIsTrashed(svc, "dead")).toBe(true);
  });
  it("is true for a missing note and for an empty id", async () => {
    const svc = fakeSvc({ notes: [] });
    expect(await noteIsTrashed(svc, "nope")).toBe(true);
    expect(await noteIsTrashed(svc, "")).toBe(true);
  });
  it("treats redis-stored notes as not trashed (no deleted_at column)", async () => {
    const svc = fakeSvc({ notes: [] });
    expect(await noteIsTrashed(svc, "r1", "redis")).toBe(false);
  });
});

// ── Entry-point gating: chat send + saveSharedNote on a trashed note ────────
const h = vi.hoisted(() => ({ uid: "viewer-1", tables: {} as Record<string, any[]> }));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: h.uid } } }) } }),
  createServiceRoleClient: () => fakeSvc(h.tables),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/utils/notifications/create", () => ({
  notifyChatMessage: () => {}, markChatNotificationsRead: async () => {},
  notifyShareAdded: async () => {}, notifyNoteEdited: async () => {},
}));
vi.mock("@/utils/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true, remaining: 10, resetAt: 0 }) }));
vi.mock("@/lib/subscription", () => ({ ownerCanCollaborate: async () => true, getCollabAllowance: async () => ({ notebooks: 99, editors: 99 }) }));
vi.mock("@/utils/storage/r2-private", () => ({
  CHAT_PREFIX: "chat/", PRESIGN_TTL_SECONDS: 60,
  presignPut: async () => "", presignGet: async () => "",
  headPrivateObject: async () => ({}), deletePrivateObject: async () => {},
}));

describe("recipient paths refuse a trashed note (A4)", () => {
  beforeEach(() => { h.uid = "viewer-1"; h.tables = {}; });

  it("sendChatMessage is blocked when the note is trashed", async () => {
    h.tables = { notes: [{ id: "n1", author: "owner-1", deleted_at: "2026-10-03T00:00:00Z" }] };
    const { sendChatMessage } = await import("@/app/actions/chatActions");
    const res = await sendChatMessage("n1", "hello");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/access/i);
  });

  it("saveSharedNote is blocked when the note is trashed", async () => {
    h.tables = {
      shared_notes: [{ id: "s1", shortcode: "abc123", note_id: "n1", storage: "supabase", link_permission: "edit" }],
      notes: [{ id: "n1", deleted_at: "2026-10-03T00:00:00Z" }],
    };
    const { sharingOperation } = await import("@/app/actions/sharing");
    const res: any = await sharingOperation({
      operation: "saveSharedNote",
      shortcode: "abc123",
      title: "t",
      content: "c",
      contentFormat: "markdown",
      currentUserId: "viewer-1",
    } as any);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not found/i);
  });
});
