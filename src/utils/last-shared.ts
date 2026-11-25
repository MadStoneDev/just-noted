// src/utils/last-shared.ts
// The shared note the main area last showed, restored on reload. Stored with
// the account that had it open: restoring another account's shared note on a
// shared device (or after a switch) opened a note this account can't see, and
// showed "Can't access note".

const KEY = "justnoted_last_shared";

export interface LastShared {
  shortcode: string;
  /** The signed-in account id, or "guest". */
  account: string;
}

export function readLastShared(): LastShared | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && typeof v.shortcode === "string" && typeof v.account === "string") return v;
  } catch {
    /* a pre-scoping plain shortcode, or unreadable: not restorable */
  }
  return null;
}

export function writeLastShared(value: LastShared | null): void {
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * The shortcode to reopen on load, if any. Only on "/": any other path (a /n/
 * link, Settings, a notebook) decides the view itself, and restoring on top of
 * it replaced the note in the URL with a different one.
 */
export function shortcodeToRestore(saved: LastShared | null, account: string, pathname: string): string | null {
  if (pathname !== "/") return null;
  if (!saved || saved.account !== account) return null;
  return saved.shortcode;
}
