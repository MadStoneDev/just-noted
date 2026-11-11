import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertNotProductionSupabase, e2eFileEnv } from "./env";

// Service-role helpers for the E2E harness (seed + teardown + minting sessions).
//
// Everything here talks to the TEST database only: values come from .env.e2e
// (see ./env.ts) — never .env.local, which points at production — and every
// client creation re-checks that the URL isn't production. The service-role key
// is never committed, written to the seed file, or printed.

// Every test account lives under this domain. Teardown and stale-run cleanup only
// ever touch auth users whose email ends with it — a hard guard against deleting
// a real account.
export const TEST_EMAIL_DOMAIN = "e2e.justnoted.test";

export const SEED_FILE = path.resolve(__dirname, "../.auth/seed.json");

export function supabaseUrl(): string | undefined {
  return e2eFileEnv().NEXT_PUBLIC_SUPABASE_URL || undefined;
}
export function anonKey(): string | undefined {
  return e2eFileEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined;
}
function serviceRoleKey(): string | undefined {
  return e2eFileEnv().SUPABASE_SERVICE_ROLE_KEY || undefined;
}

export function hasAdminEnv(): boolean {
  return !!(supabaseUrl() && anonKey() && serviceRoleKey());
}

let svc: SupabaseClient | null = null;
export function adminClient(): SupabaseClient {
  if (!hasAdminEnv()) throw new Error("E2E admin env missing in .env.e2e (NEXT_PUBLIC_SUPABASE_URL / anon / service-role key)");
  assertNotProductionSupabase(supabaseUrl(), "the E2E admin client");
  if (!svc) {
    svc = createClient(supabaseUrl()!, serviceRoleKey()!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return svc;
}

export function isTestEmail(email: string | undefined | null): boolean {
  return !!email && email.toLowerCase().endsWith(`@${TEST_EMAIL_DOMAIN}`);
}

// Mirrors src/utils/account/purge-account.ts (which is server-only and can't be
// imported here), minus the R2 chat-media/export purge — the harness doesn't
// upload media yet. Deleting the auth user does NOT cascade to `authors`, so the
// profile row is removed explicitly. Every step tolerates already-gone data.
export async function purgeTestUser(userId: string): Promise<void> {
  const db = adminClient();
  const { data: u } = await db.auth.admin.getUserById(userId);
  if (u?.user && !isTestEmail(u.user.email)) {
    throw new Error(`refusing to purge non-test account ${userId}`);
  }
  const del = async (table: string, col: string) => {
    try {
      await db.from(table).delete().eq(col, userId);
    } catch {
      /* best effort */
    }
  };
  await del("shared_notes_readers", "reader_id");
  await del("shared_notes", "note_owner_id");
  await del("note_versions", "author");
  await del("notes", "author");
  await del("notebooks", "owner");
  await del("tags", "owner");
  await del("collections", "owner");
  await del("note_chat_reads", "user_id");
  await del("saved_shared_notes", "user_id");
  await del("writing_sessions", "user_id");
  await del("roadmap_votes", "user_id");
  await del("notifications", "user_id");
  await del("user_settings", "user_id");
  await del("subscriptions", "user_id");
  await del("account_deletions", "user_id");
  await del("authors", "id");
  if (u?.user) await db.auth.admin.deleteUser(userId);
}

// Remove test accounts left behind by a crashed/aborted run.
export async function purgeStaleTestUsers(): Promise<number> {
  const db = adminClient();
  // Collect first, delete after — deleting while paging would shift pages.
  const stale: string[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const u of users) if (isTestEmail(u.email)) stale.push(u.id);
    if (users.length < 200) break;
  }
  for (const id of stale) await purgeTestUser(id);
  return stale.length;
}
