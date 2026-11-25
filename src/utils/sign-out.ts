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
// any sign-out. And without the user's explicit "Sign out anyway", nothing
// unsynced of the account is cleared either (clearAccountData): an edit that
// turns up after the count stays parked for the account.

import type { SupabaseClient } from "@supabase/supabase-js";
import { processQueue, queuedNoteIdsForAccount, clearAccountOps, settleQueueWrites } from "./offline-queue";
import { clearAccountNotes } from "./notes-idb-cache";
import { getActiveSupabaseUser, setActiveSupabaseUser } from "./offline-queue-guard";
import { useNotesStore } from "@/stores/notes-store";

/** Open editors still holding text that hasn't been saved or queued. */
export interface FlushResult {
  /** Cloud notes whose editor is still dirty after its flush. */
  dirtyCloudNotes: Set<string>;
  /** An editor's flush didn't settle in time: its text may be anywhere. */
  timedOut: boolean;
}

/**
 * Ask every open editor to save now, and wait for those saves (bounded). Each
 * editor's save either lands or is queued before its flush settles (the save
 * path awaits its queue write); an editor whose text still isn't saved after
 * that reports itself dirty.
 */
export async function flushOpenEditors(timeoutMs = 5000): Promise<FlushResult> {
  const pending: Promise<unknown>[] = [];
  const dirtyCloudNotes = new Set<string>();
  try {
    window.dispatchEvent(
      new CustomEvent("justnoted:flush-saves", {
        detail: {
          register: (p: Promise<unknown>) => pending.push(p),
          dirty: (noteId: string, source?: string) => {
            if (source !== "redis") dirtyCloudNotes.add(noteId);
          },
        },
      }),
    );
  } catch {
    /* no window */
  }
  if (!pending.length) return { dirtyCloudNotes, timedOut: false };
  const settled = await Promise.race([
    Promise.allSettled(pending).then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs)),
  ]);
  return { dirtyCloudNotes, timedOut: !settled };
}

/**
 * How many of this account's notes have edits that haven't reached the server:
 * its queued cloud entries (once every queue write in flight has landed), plus
 * open editors the flush couldn't save or queue (`flush`). An editor whose
 * flush timed out counts as one unsynced note: unknown is never "nothing".
 */
export async function unsyncedNoteCount(accountId: string | null, flush?: FlushResult): Promise<number> {
  if (!accountId) return 0;
  await settleQueueWrites();
  const ids = await queuedNoteIdsForAccount(accountId);
  for (const id of flush?.dirtyCloudNotes ?? []) ids.add(id);
  return Math.max(ids.size, flush?.timedOut ? 1 : 0);
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
    const flush = await flushOpenEditors();
    await processQueue({ now: true }).catch(() => {});
    if ((await unsyncedNoteCount(accountId, flush)) === 0) return 0;
    if (i < attempts - 1) await sleep(gapMs);
  }
  return unsyncedNoteCount(accountId, await flushOpenEditors());
}

/**
 * The session can't be ended at the auth server (offline): end it on this
 * device instead by dropping the auth cookie(s) @supabase/ssr reads.
 * completeSignOut then has supabase-js sign out locally. The refresh token
 * stays valid server-side until it expires or is revoked from Settings.
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

/**
 * Remove this account's cached cloud notes and queue entries. Nothing else.
 *
 * Unsynced writing goes only with `discardUnsynced` — the user chose "Sign out
 * anyway". Without it, every queue entry (each one is an edit not yet on the
 * server) and every cached copy marked localEdit stays, parked for the account
 * until it signs in again: an edit that turned up after the unsynced count is
 * never cleared by a sign-out that thought there was nothing left.
 */
export async function clearAccountData(
  accountId: string,
  opts: { discardUnsynced?: boolean } = {},
): Promise<void> {
  const discard = !!opts.discardUnsynced;
  await Promise.allSettled([
    discard ? clearAccountOps(accountId) : Promise.resolve(0),
    clearAccountNotes(accountId, { keepLocalEdits: !discard }),
  ]);
}

/**
 * End the session, then clear the account's data (cache + queue entries).
 * Only call once its edits have synced or the user has chosen to lose them
 * (`discardUnsynced`). Without that choice the open editors are flushed and
 * the count taken once more first: anything unsynced refuses the sign-out
 * (`unsynced`), and whatever still turns up is left parked (clearAccountData).
 * If the session can't be ended, nothing is cleared and the user stays signed
 * in with everything as it was.
 *
 * Offline, the session is ended on this device only: the auth cookie is
 * dropped and supabase-js then signs out locally (it finds no session to
 * revoke), which emits SIGNED_OUT to the app as usual — no page load needed.
 */
export async function completeSignOut(
  supabase: SupabaseClient,
  accountId: string | null,
  opts: { scope?: "global" | "local"; discardUnsynced?: boolean } = {},
): Promise<{ ok: boolean; error?: string; unsynced?: number }> {
  if (accountId && !opts.discardUnsynced) {
    const left = await unsyncedNoteCount(accountId, await flushOpenEditors());
    if (left > 0) return { ok: false, unsynced: left };
  }

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
    // With the cookie gone supabase-js has no session to revoke: it signs out
    // locally, without the network, and tells the auth listener.
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  }
  setActiveSupabaseUser(null);
  if (accountId) await clearAccountData(accountId, { discardUnsynced: opts.discardUnsynced });
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
