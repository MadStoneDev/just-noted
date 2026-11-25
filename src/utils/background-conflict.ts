// Background (unattended) content writes: offline-queue replays, the tab-close
// keepalive save, and refresh pushes of an unsynced local copy. Nobody is
// looking at the note when these land, so a conflict must never overwrite the
// server: if the server has moved past the write's base version, the server
// note is left exactly as it is and the incoming text is saved as a new
// "(conflicted copy)" note instead. Same rule as the load-time reconcile (server
// wins the original, local text becomes the copy).
//
// Kept pure so both server paths (Supabase, Redis) and the tests share it.

import { sameNoteContent } from "@/utils/notes-utils";

export type BackgroundWriteDecision =
  /** Server is still at the write's base: apply it as a normal CAS write. */
  | "apply"
  /** Server already holds this text: nothing to write, no copy. */
  | "noop"
  /** Server moved on (or the note was deleted) with different text: copy. */
  | "copy";

/**
 * What a background write was made from. Normally the server `version` it was
 * edited on. Queue entries from older builds carry no version; for those the
 * time the edit was queued stands in: the server is "still at base" only if it
 * has not changed since then.
 */
export type BackgroundBase = { version: number } | { queuedAt: number };

export function isBackgroundBase(b: unknown): b is BackgroundBase {
  if (!b || typeof b !== "object") return false;
  const { version, queuedAt } = b as Record<string, unknown>;
  if (version !== undefined) return Number.isInteger(version);
  return typeof queuedAt === "number" && Number.isFinite(queuedAt) && queuedAt > 0;
}

/** Server's last-updated time as epoch ms (Supabase ISO string or Redis ms). */
export function toEpochMs(t: string | number | null | undefined): number | null {
  if (typeof t === "number") return Number.isFinite(t) ? t : null;
  if (typeof t === "string" && t) {
    const ms = Date.parse(t);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

export function decideBackgroundWrite(p: {
  /** Versioned base (shorthand for `base: { version }`). */
  baseVersion?: number;
  base?: BackgroundBase;
  serverVersion: number;
  serverContent: string | null | undefined;
  serverDeleted?: boolean;
  /** Server's last-updated time — needed for a `queuedAt` base. */
  serverUpdatedAt?: string | number | null;
  content: string;
}): BackgroundWriteDecision {
  const same = sameNoteContent(p.serverContent ?? "", p.content);
  if (p.serverDeleted) return same ? "noop" : "copy";
  const base: BackgroundBase | undefined =
    typeof p.baseVersion === "number" ? { version: p.baseVersion } : p.base;
  if (base && atBase(base, p.serverVersion, p.serverUpdatedAt)) return "apply";
  return same ? "noop" : "copy";
}

function atBase(
  base: BackgroundBase,
  serverVersion: number,
  serverUpdatedAt: string | number | null | undefined,
): boolean {
  if ("version" in base) return base.version === serverVersion;
  // Legacy entry: unknown server time can't prove "unchanged" — treat it as
  // moved on (a copy never loses anything; an overwrite might).
  const updated = toEpochMs(serverUpdatedAt);
  return updated !== null && updated <= base.queuedAt;
}

/** Which copy to create on a conflict. `id` is fixed per queued edit, so the
 * keepalive save and the later queue replay of the same edit make ONE copy. */
export interface ConflictCopySpec {
  id: string;
  /** Human time stamp for the title, formatted on the client (its locale/zone). */
  stamp: string;
}

export const CONFLICT_STAMP_MAX = 64;

export function conflictStamp(at: Date = new Date()): string {
  return at.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function conflictCopyTitle(baseTitle: string | null | undefined, stamp: string): string {
  return `${baseTitle || "Untitled"} (conflicted copy, ${stamp})`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server-side validation of a client-supplied copy spec. */
export function isValidConflictCopy(c: unknown): c is ConflictCopySpec {
  if (!c || typeof c !== "object") return false;
  const { id, stamp } = c as Record<string, unknown>;
  return (
    typeof id === "string" &&
    UUID_RE.test(id) &&
    typeof stamp === "string" &&
    stamp.length > 0 &&
    stamp.length <= CONFLICT_STAMP_MAX
  );
}
