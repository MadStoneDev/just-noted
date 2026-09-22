// Multi-account on this device (design surface 12).
// Stores each signed-in account's Supabase session so the user can switch
// between them. Switching swaps the session and does a full reload so the SSR
// cookie is refreshed server-side. Client-side token storage is a deliberate
// tradeoff for local multi-account.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DeviceAccount {
  id: string;
  email: string;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken: string;
  lastUsed: number;
  sessionValid: boolean;
}

const KEY = "jn_accounts";
export const MAX_ACCOUNTS = 5;

export function getAccounts(): DeviceAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveAccounts(list: DeviceAccount[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ACCOUNTS)));
  } catch {}
  // Let mounted views (rail avatar, account menu, settings list) re-read without
  // a page refresh after an account is captured/added/removed.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("justnoted:accounts-changed"));
  }
}

export function upsertAccount(acc: DeviceAccount): void {
  const list = getAccounts();
  const i = list.findIndex((a) => a.id === acc.id);
  if (i >= 0) list[i] = { ...list[i], ...acc };
  else list.unshift(acc);
  saveAccounts(list);
}

export function removeAccount(id: string): void {
  saveAccounts(getAccounts().filter((a) => a.id !== id));
}

// Capture the currently-signed-in account (fresh tokens + profile) into the
// device store. Call on app load.
export async function captureCurrentAccount(supabase: SupabaseClient): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const { user } = session;
  const { data: author } = await supabase
    .from("authors")
    .select("username, avatar_url")
    .eq("id", user.id)
    .single();
  upsertAccount({
    id: user.id,
    email: user.email || "",
    handle: author?.username || "",
    avatarUrl: author?.avatar_url || "",
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    lastUsed: Date.now(),
    sessionValid: true,
  });
  return user.id;
}

// Swap to another stored account and reload. setSession refreshes an expired
// access token from the refresh token; a full reload re-primes the SSR cookie.
export async function switchToAccount(
  supabase: SupabaseClient,
  target: DeviceAccount,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.auth.setSession({
    access_token: target.accessToken,
    refresh_token: target.refreshToken,
  });
  if (error) {
    upsertAccount({ ...target, sessionValid: false });
    return { ok: false, error: error.message };
  }
  upsertAccount({ ...target, lastUsed: Date.now(), sessionValid: true });
  window.location.href = "/";
  return { ok: true };
}
