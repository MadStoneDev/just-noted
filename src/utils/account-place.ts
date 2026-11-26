// src/utils/account-place.ts
// Where each account left off on this device: the sidebar panel (rail view) and
// the note it last had open (one of its own notes by id, or a shared note by
// shortcode). Kept per account so a switch reopens that account's place and
// never carries the previous account's panel or note across.

import { createClient } from "@/utils/supabase/client";
import { SWITCH_MARKER_KEY } from "@/utils/accounts";

const KEY = "jn_account_place";

export const RAIL_VIEWS = ["notes", "notebooks", "tags", "shared"] as const;
export type RailView = (typeof RAIL_VIEWS)[number];

export interface AccountPlace {
  panel?: RailView;
  /** The account's own note last open in the editor. */
  noteId?: string;
  /** A shared note last open in the main area (wins over noteId). */
  shared?: string;
}

type PlaceMap = Record<string, AccountPlace>;

function readAll(): PlaceMap {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function clean(p: unknown): AccountPlace {
  const out: AccountPlace = {};
  if (!p || typeof p !== "object") return out;
  const { panel, noteId, shared } = p as Record<string, unknown>;
  if (typeof panel === "string" && (RAIL_VIEWS as readonly string[]).includes(panel)) out.panel = panel as RailView;
  if (typeof noteId === "string" && noteId) out.noteId = noteId;
  if (typeof shared === "string" && shared) out.shared = shared;
  return out;
}

/** The remembered place for an account ("guest" when signed out). */
export function readPlace(account: string): AccountPlace {
  return clean(readAll()[account]);
}

/** Merge into an account's place; a null field clears it. */
export function writePlace(
  account: string,
  patch: { panel?: RailView | null; noteId?: string | null; shared?: string | null },
): void {
  try {
    const all = readAll();
    const next: Record<string, unknown> = { ...clean(all[account]) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (v === null) delete next[k];
      else next[k] = v;
    }
    all[account] = clean(next);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}

/**
 * The own note to open on load. After a switch there is no "most recent note"
 * fallback: if the remembered note is gone (or a shared note was the one open),
 * the account lands with no note open.
 */
export function ownNoteToRestore(
  place: AccountPlace,
  liveIds: readonly string[],
  afterSwitch: boolean,
): string | null {
  if (afterSwitch && place.shared) return null;
  if (place.noteId && liveIds.includes(place.noteId)) return place.noteId;
  if (afterSwitch) return null;
  return liveIds[0] ?? null;
}

/**
 * The shared note to reopen on load, if any. Only on "/": any other path (a /n/
 * link, Settings, a notebook) decides the view itself, and restoring on top of
 * it replaced the note in the URL with a different one.
 */
export function sharedToRestore(place: AccountPlace, pathname: string): string | null {
  if (pathname !== "/") return null;
  return place.shared ?? null;
}

// Whether this page load is the boot right after an account switch. Read once
// and cached: NoteWrapper clears the marker once the new account has synced.
let switchBoot: boolean | null = null;
export function isSwitchBoot(): boolean {
  if (switchBoot === null) {
    try {
      switchBoot = typeof sessionStorage !== "undefined" && !!sessionStorage.getItem(SWITCH_MARKER_KEY);
    } catch {
      switchBoot = false;
    }
  }
  return switchBoot;
}

// The signed-in account id ("guest" when signed out), resolved once per page
// load. Every account change (switch, sign in/out) reloads the page.
let accountPromise: Promise<string> | null = null;
export function currentAccount(): Promise<string> {
  if (!accountPromise) {
    accountPromise = createClient()
      .auth.getSession()
      .then(({ data }) => data.session?.user?.id ?? "guest")
      .catch(() => "guest");
  }
  return accountPromise;
}

/** Test hook: reset the per-load caches. */
export function __resetAccountPlaceCaches(): void {
  switchBoot = null;
  accountPromise = null;
}
