// Sign-out without losing writing.
//
// Two kinds of sign-out, and neither may silently wipe unsynced work:
//
// - Involuntary (session expired or revoked, token refresh failed): nothing is
//   cleared. The account's queued edits and cached cloud notes are parked —
//   tagged with the account and out of scope while it's signed out — and
//   replay through the CAS when it signs back in (use-notes-sync). The app
//   shows "You've been signed out — sign in to sync N unsaved notes".
// - Chosen by the user (this module): open editors are flushed and the
//   account's queue is drained first. With nothing unsynced, only that
//   account's cached cloud notes and queue entries are cleared. With unsynced
//   edits, sign-out waits for them; the user can cancel (stay signed in), and
//   only if the sync fails is "sign out anyway" offered, as a second step.
//
// Local (guest) notes and other accounts' parked entries are never cleared by
// any sign-out.

import type { SupabaseClient } from "@supabase/supabase-js";
import { processQueue, queuedNoteIdsForAccount, clearAccountOps } from "./offline-queue";
import { clearAccountNotes } from "./notes-idb-cache";
import { getActiveSupabaseUser, setActiveSupabaseUser } from "./offline-queue-guard";
import { useNotesStore } from "@/stores/notes-store";

/** Ask every open editor to save now, and wait for those saves (bounded). */
export async function flushOpenEditors(timeoutMs = 5000): Promise<void> {
  const pending: Promise<unknown>[] = [];
  try {
    window.dispatchEvent(
      new CustomEvent("justnoted:flush-saves", {
        detail: { register: (p: Promise<unknown>) => pending.push(p) },
      }),
    );
  } catch {
    /* no window */
  }
  if (!pending.length) return;
  await Promise.race([Promise.allSettled(pending), new Promise((r) => setTimeout(r, timeoutMs))]);
}

/** How many of this account's notes have edits that haven't reached the server. */
export async function unsyncedNoteCount(accountId: string | null): Promise<number> {
  if (!accountId) return 0;
  return (await queuedNoteIdsForAccount(accountId)).size;
}

function offline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Try to get this account's queued edits to the server before it signs out.
 * Resolves to how many notes are still unsynced (0 = all landed). Gives up
 * after `attempts` forced passes, at once when offline, or when `cancelled()`.
 */
export async function syncAccountBeforeSignOut(
  accountId: string,
  opts: { attempts?: number; gapMs?: number; cancelled?: () => boolean } = {},
): Promise<number> {
  const { attempts = 3, gapMs = 1500, cancelled = () => false } = opts;
  for (let i = 0; i < attempts; i++) {
    if (cancelled() || offline()) break;
    await flushOpenEditors();
    await processQueue({ now: true }).catch(() => {});
    if ((await unsyncedNoteCount(accountId)) === 0) return 0;
    if (i < attempts - 1) await sleep(gapMs);
  }
  return unsyncedNoteCount(accountId);
}

/**
 * The session can't be ended at the auth server (offline): end it on this
 * device instead by dropping the auth cookie(s) @supabase/ssr reads. The
 * caller reloads, so the in-memory client goes too. The refresh token stays
 * valid server-side until it expires or is revoked from Settings.
 */
function dropLocalSession(): void {
  try {
    for (const part of document.cookie.split(";")) {
      const name = part.split("=")[0]?.trim();
      if (name && name.startsWith("sb-") && name.includes("-auth-token")) {
        document.cookie = `${name}=; Max-Age=0; path=/`;
      }
    }
  } catch {
    /* no document */
  }
}

/** Remove this account's cached cloud notes and queue entries. Nothing else. */
export async function clearAccountData(accountId: string): Promise<void> {
  await Promise.allSettled([clearAccountOps(accountId), clearAccountNotes(accountId)]);
}

/**
 * End the session, then clear the account's data (cache + queue entries).
 * Only call once its edits have synced or the user has chosen to lose them.
 * If the session can't be ended, nothing is cleared and the user stays signed
 * in with everything as it was.
 */
export async function completeSignOut(
  supabase: SupabaseClient,
  accountId: string | null,
  opts: { scope?: "global" | "local" } = {},
): Promise<{ ok: boolean; error?: string }> {
  // Take the account's notes out of the store first, so the auth listener's
  // refresh on SIGNED_OUT can't write them back into the cache after the
  // clear below. Put back if the sign-out doesn't happen.
  const store = useNotesStore.getState();
  const before = store.notes;
  store.syncFromBackend(before.filter((n) => n.source !== "supabase"));

  // "Sign out" ends this device's session only (supabase-js defaults to global,
  // which signed the account out everywhere); "Sign out everywhere" passes global.
  const { error } = await supabase.auth.signOut({ scope: opts.scope ?? "local" });
  if (error) {
    const retryable = offline() || error.name === "AuthRetryableFetchError";
    // "Everywhere" needs the auth server; on this device we can always sign out.
    if (!retryable || opts.scope === "global") {
      useNotesStore.getState().syncFromBackend(before);
      return { ok: false, error: error.message };
    }
    dropLocalSession();
  }
  setActiveSupabaseUser(null);
  if (accountId) await clearAccountData(accountId);
  return { ok: true };
}

/** The signed-in account's id: the queue's view first, the session otherwise. */
export async function currentAccountId(supabase: SupabaseClient): Promise<string | null> {
  const active = getActiveSupabaseUser();
  if (active) return active;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}
