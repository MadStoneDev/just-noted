import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The flush step drains the offline queue; keep it inert here.
vi.mock("@/utils/offline-queue", () => ({
  processQueue: vi.fn(async () => {}),
  getQueueSize: vi.fn(async () => 0),
}));

import { switchToAccount, OFFLINE_SWITCH_MESSAGE, type DeviceAccount } from "./accounts";

const target: DeviceAccount = {
  id: "user-b",
  email: "b@example.test",
  handle: "bee",
  accessToken: "at",
  refreshToken: "rt",
  lastUsed: 0,
  sessionValid: true,
};

// Minimal browser globals for accounts.ts (it runs client-side).
function installBrowser(onLine: boolean) {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const location = { href: "/current" };
  vi.stubGlobal("navigator", { onLine });
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", { ...storage });
  vi.stubGlobal("window", {
    location,
    dispatchEvent: () => true,
  });
  storage.setItem("jn_accounts", JSON.stringify([target]));
  return { location, stored: () => JSON.parse(storage.getItem("jn_accounts") || "[]") as DeviceAccount[] };
}

function fakeSupabase(result: { error: { name: string; message: string } | null }) {
  return { auth: { setSession: vi.fn(async () => ({ data: {}, ...result })) } } as any;
}

describe("switchToAccount — offline", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("refuses while offline: no session swap, no reload, account stays valid", async () => {
    const env = installBrowser(false);
    const supabase = fakeSupabase({ error: null });
    const res = await switchToAccount(supabase, target);
    expect(res).toEqual({ ok: false, offline: true, error: OFFLINE_SWITCH_MESSAGE });
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
    expect(env.location.href).toBe("/current");
    expect(env.stored()[0].sessionValid).toBe(true);
  });

  it("a network failure mid-switch is reported as offline, not as an expired session", async () => {
    const env = installBrowser(true);
    const supabase = fakeSupabase({ error: { name: "AuthRetryableFetchError", message: "Failed to fetch" } });
    const res = await switchToAccount(supabase, target);
    expect(res.offline).toBe(true);
    expect(res.error).toBe(OFFLINE_SWITCH_MESSAGE);
    expect(env.location.href).toBe("/current");
    expect(env.stored()[0].sessionValid).toBe(true);
  });

  it("a real auth rejection still marks the stored session expired", async () => {
    const env = installBrowser(true);
    const supabase = fakeSupabase({ error: { name: "AuthApiError", message: "Invalid Refresh Token" } });
    const res = await switchToAccount(supabase, target);
    expect(res.ok).toBe(false);
    expect(res.offline).toBeUndefined();
    expect(env.stored()[0].sessionValid).toBe(false);
  });

  it("online and valid: swaps the session and reloads to /", async () => {
    const env = installBrowser(true);
    const supabase = fakeSupabase({ error: null });
    const res = await switchToAccount(supabase, target);
    expect(res.ok).toBe(true);
    expect(supabase.auth.setSession).toHaveBeenCalledOnce();
    expect(env.location.href).toBe("/");
  });
});
