import type { Page } from "@playwright/test";

// Seeded-account support for signed-in (cloud) flows.
//
// The app signs in via email OTP / magic link, which can't be driven headlessly.
// For E2E we instead inject a known session's tokens before the app boots. Mint
// those tokens once (e.g. via the Supabase admin API, or capture them from a
// manual login) and pass them in as JSON via the E2E_ACCOUNTS env var:
//
//   E2E_ACCOUNTS='[{"label":"A","id":"<uuid>","accessToken":"...","refreshToken":"..."},
//                  {"label":"B","id":"<uuid>","accessToken":"...","refreshToken":"..."}]'
//
// NOTE: the exact injection mechanism must be validated against the running app.
// @supabase/ssr reads the session from a cookie (sb-<project-ref>-auth-token), so
// setting localStorage alone will not authenticate the server components / server
// actions — the cookie likely has to be set too. `signIn` is a single place to get
// that right once; until then the cloud/B7 specs skip when E2E_ACCOUNTS is unset.

export interface SeededAccount {
  label: string;
  id: string;
  accessToken: string;
  refreshToken: string;
}

export function seededAccounts(): SeededAccount[] {
  const raw = process.env.E2E_ACCOUNTS;
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Inject a seeded account's Supabase session so the app boots signed in.
 * TODO: finalise against the running app — set the sb-<ref>-auth-token cookie
 * (server-read) in addition to / instead of localStorage, then remove this note.
 */
export async function signIn(page: Page, acc: SeededAccount): Promise<void> {
  await page.addInitScript(
    ({ accessToken, refreshToken }) => {
      try {
        // Placeholder shape — replace the key with the real @supabase/ssr storage
        // key once confirmed. Kept guarded so it never throws during boot.
        const payload = JSON.stringify({ access_token: accessToken, refresh_token: refreshToken });
        (window as unknown as { __E2E_SESSION__?: string }).__E2E_SESSION__ = payload;
      } catch {
        /* ignore */
      }
    },
    { accessToken: acc.accessToken, refreshToken: acc.refreshToken },
  );
}
