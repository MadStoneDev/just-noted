import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A fake Supabase that holds `count` autosave versions for one note and records
// every delete and insert on note_versions.
const calls = { deleted: [] as string[][], inserted: 0 };
let count = 0;

vi.mock("@/lib/subscription", () => ({ getUserTier: vi.fn(async () => "draft") }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from: () => {
      const q: any = {
        select: () => q,
        eq: () => q,
        order: async () => ({ data: Array.from({ length: count }, (_, i) => ({ id: `v${i}` })) }),
        delete: () => ({ in: async (_c: string, ids: string[]) => { calls.deleted.push(ids); return {}; } }),
        insert: async () => { calls.inserted++; return { error: null }; },
      };
      return q;
    },
  }),
}));

import { saveVersion } from "./versionActions";

describe("saveVersion — autosave trimming is paused by default", () => {
  beforeEach(() => {
    calls.deleted = [];
    calls.inserted = 0;
    count = 60; // over the Draft cap of 50
  });
  afterEach(() => vi.unstubAllEnvs());

  it("deletes nothing over the cap when VERSION_HISTORY_TRIM_ENABLED is unset", async () => {
    vi.stubEnv("VERSION_HISTORY_TRIM_ENABLED", "");
    expect(await saveVersion("n1", "t", "c")).toEqual({ success: true });
    expect(calls.deleted).toEqual([]);
    expect(calls.inserted).toBe(1);
  });

  it("trims back to the cap when VERSION_HISTORY_TRIM_ENABLED=true", async () => {
    vi.stubEnv("VERSION_HISTORY_TRIM_ENABLED", "true");
    await saveVersion("n1", "t", "c");
    expect(calls.deleted).toHaveLength(1);
    expect(calls.deleted[0]).toHaveLength(11); // 60 → 49, +1 insert = 50
    expect(calls.inserted).toBe(1);
  });
});
