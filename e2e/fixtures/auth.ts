import fs from "node:fs";
import { test, type BrowserContext, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { adminClient, anonKey, hasAdminEnv, SEED_FILE, supabaseUrl } from "./admin";
import { assertNotProductionSupabase } from "./env";

// Signed-in (cloud) support for E2E.
//
// The app signs in with email OTP. Tests can't read an inbox, so we mint a real
// session the same way the OTP link would: the admin API generates a magic-link
// token hash (no email is sent) and the anon client verifies it. GoTrue's
// password grant is NOT usable here — the self-hosted instance has captcha
// enabled on /token, and /verify is not captcha-gated.
//
// The session is then written as the exact cookie(s) @supabase/ssr uses
// (sb-<ref>-auth-token, base64-encoded, chunked when large) by running
// verifyOtp through a createServerClient backed by an in-memory cookie jar. Both
// the server (middleware / server actions) and the browser client read that
// cookie, so no localStorage injection is needed for the session itself.
//
// Accounts are created per run by e2e/global-setup.ts and listed in
// e2e/.auth/seed.json (ids/emails/handles only — never tokens or keys).

export interface SeededAccount {
  label: string;
  id: string;
  email: string;
  handle: string;
}

export interface SeedState {
  runId: string;
  accounts: SeededAccount[];
  // A note owned by A, shared with B (edit). For the sharing/collab specs.
  sharedNote?: { noteId: string; shareId: string; shortcode: string };
}

export function seedState(): SeedState | null {
  if (!hasAdminEnv()) return null;
  try {
    return JSON.parse(fs.readFileSync(SEED_FILE, "utf8")) as SeedState;
  } catch {
    return null;
  }
}

export function seededAccounts(): SeededAccount[] {
  return seedState()?.accounts ?? [];
}

export interface MintedSession {
  accessToken: string;
  refreshToken: string;
  cookies: { name: string; value: string }[];
}

// Mint a fresh session for an account. Fresh per test on purpose: GoTrue rotates
// refresh tokens, so sharing one session across parallel tests would revoke it.
// A magic link is invalidated when another one is generated for the same
// account, so two tests minting at the same moment can race: retry that.
export async function mintSession(acc: SeededAccount): Promise<MintedSession> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await mintSessionOnce(acc);
    } catch (e) {
      const raced = /invalid or has expired/i.test(String((e as Error)?.message));
      if (!raced || attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 600));
    }
  }
}

async function mintSessionOnce(acc: SeededAccount): Promise<MintedSession> {
  const { data: link, error: linkErr } = await adminClient().auth.admin.generateLink({
    type: "magiclink",
    email: acc.email,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    throw new Error(`generateLink failed for ${acc.label}: ${linkErr?.message}`);
  }
  assertNotProductionSupabase(supabaseUrl(), "mintSession");
  const jar = new Map<string, string>();
  const client = createServerClient(supabaseUrl()!, anonKey()!, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list: { name: string; value: string }[]) => {
        for (const { name, value } of list) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const { data, error } = await client.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (error || !data.session) throw new Error(`verifyOtp failed for ${acc.label}: ${error?.message}`);
  if (jar.size === 0) throw new Error("no auth cookie was written by @supabase/ssr");
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    cookies: [...jar].map(([name, value]) => ({ name, value })),
  };
}

/**
 * Boot the app signed in as `acc`. Sets the @supabase/ssr auth cookie(s) on the
 * context before the first navigation. `alsoOnDevice` adds other accounts to the
 * device account list (jn_accounts) — what "Add account" would have stored — so
 * the account switcher can offer them.
 */
export async function signIn(
  target: Page | BrowserContext,
  acc: SeededAccount,
  opts: { alsoOnDevice?: SeededAccount[]; baseURL?: string } = {},
): Promise<void> {
  const context = "context" in target ? target.context() : target;
  // Tell the no-conflicted-copies check (fixtures/no-conflicts.ts) which
  // accounts this test writes as. Outside a test (e.g. setup) there's no info.
  try {
    for (const a of [acc, ...(opts.alsoOnDevice ?? [])]) (test.info() as any)._signedIn?.add(a.id);
  } catch {
    /* not inside a test */
  }
  const baseURL = opts.baseURL || process.env.E2E_BASE_URL || "http://localhost:3050";
  const session = await mintSession(acc);
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  await context.addCookies(
    session.cookies.map((c) => ({ ...c, url: baseURL, sameSite: "Lax" as const, expires })),
  );

  const others = [];
  for (const o of opts.alsoOnDevice ?? []) {
    const s = await mintSession(o);
    others.push({
      id: o.id,
      email: o.email,
      handle: o.handle,
      avatarUrl: "",
      accessToken: s.accessToken,
      refreshToken: s.refreshToken,
      lastUsed: Date.now() - 60_000,
      sessionValid: true,
    });
  }
  if (others.length) {
    // Add once per origin: never clobber entries the app has since updated
    // (it rewrites tokens on switch/capture).
    await context.addInitScript((list) => {
      try {
        if (sessionStorage.getItem("__e2e_accounts_seeded")) return;
        const cur = JSON.parse(localStorage.getItem("jn_accounts") || "[]");
        for (const a of list) if (!cur.some((c: { id: string }) => c.id === a.id)) cur.push(a);
        localStorage.setItem("jn_accounts", JSON.stringify(cur));
        sessionStorage.setItem("__e2e_accounts_seeded", "1");
      } catch {
        /* ignore */
      }
    }, others);
  }
}
