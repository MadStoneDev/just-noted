import { vi, describe, it, expect, beforeEach } from "vitest";

// A chainable, thenable Supabase fake: supports .select().eq().is().in().limit()
// .maybeSingle()/.single(), `await <builder>`, .insert(), and auth.admin.
function fakeSvc(opts: { settings: any; inserted: any[]; email?: string | null }) {
  const tables: Record<string, any[]> = {
    shared_notes: [{ id: "s1", note_id: "n1", note_owner_id: "owner-1", shortcode: "sc1" }],
    notes: [{ id: "n1", title: "My Note", author: "owner-1" }],
    authors: [{ id: "owner-1", username: "alice" }],
    user_settings: [{ user_id: "rcpt-1", settings: { notifications: opts.settings } }],
    notifications: [],
  };
  const make = (table: string) => {
    let rows = [...(tables[table] || [])];
    const api: any = {
      select: () => api,
      eq: (c: string, v: any) => { rows = rows.filter((r) => String(r[c]) === String(v)); return api; },
      in: (c: string, v: any[]) => { rows = rows.filter((r) => v.includes(r[c])); return api; },
      is: (c: string, v: any) => { rows = rows.filter((r) => (v === null ? r[c] == null : r[c] === v)); return api; },
      limit: () => api,
      maybeSingle: async () => ({ data: rows[0] ?? null }),
      single: async () => ({ data: rows[0] ?? null }),
      insert: async (row: any) => { opts.inserted.push({ table, row }); return { error: null }; },
      then: (resolve: any) => resolve({ data: rows }),
    };
    return api;
  };
  return {
    from: make,
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { id, email: opts.email ?? "rcpt@example.com" } } }) } },
  };
}

const h = vi.hoisted(() => ({ svc: null as any, mails: [] as any[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/server", () => ({ createServiceRoleClient: () => h.svc }));
vi.mock("@/utils/email/send", () => ({ sendEmail: async (opts: any) => { h.mails.push(opts); return true; } }));

describe("notifyShareAdded (A5: in-app + email per prefs)", () => {
  let inserted: any[];
  beforeEach(() => { inserted = []; h.mails = []; });

  it("creates the in-app notification by default (email off)", async () => {
    h.svc = fakeSvc({ settings: null, inserted }); // null prefs → registry defaults
    const { notifyShareAdded } = await import("@/utils/notifications/create");
    await notifyShareAdded("s1", "rcpt-1");
    expect(inserted.find((i) => i.table === "notifications" && i.row.type === "shared_with_me")).toBeTruthy();
    expect(h.mails).toHaveLength(0); // shared_with_me email defaults to off
  });

  it("sends an email when the recipient set email to instantly", async () => {
    h.svc = fakeSvc({ settings: { shared_with_me: { email: "instantly" } }, inserted, email: "her@example.com" });
    const { notifyShareAdded } = await import("@/utils/notifications/create");
    await notifyShareAdded("s1", "rcpt-1");
    expect(h.mails).toHaveLength(1);
    expect(h.mails[0].to).toBe("her@example.com");
    expect(h.mails[0].subject).toMatch(/shared a note/i);
    expect(inserted.find((i) => i.table === "notifications")).toBeTruthy(); // in-app still created
  });

  it("does not send an email for daily/weekly (digest, not instant)", async () => {
    h.svc = fakeSvc({ settings: { shared_with_me: { email: "daily" } }, inserted });
    const { notifyShareAdded } = await import("@/utils/notifications/create");
    await notifyShareAdded("s1", "rcpt-1");
    expect(h.mails).toHaveLength(0);
  });

  it("emails only (no in-app row) when in-app is off but email is instant", async () => {
    h.svc = fakeSvc({ settings: { shared_with_me: { inApp: "off", email: "instantly" } }, inserted });
    const { notifyShareAdded } = await import("@/utils/notifications/create");
    await notifyShareAdded("s1", "rcpt-1");
    expect(inserted.find((i) => i.table === "notifications")).toBeFalsy();
    expect(h.mails).toHaveLength(1);
  });
});
