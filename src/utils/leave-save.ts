// Best-effort save fired while a tab is closing (pagehide), for cloud and
// guest (Redis) notes alike.
//
// A server action can't outlive the page, but a `fetch(..., { keepalive: true })`
// can: the browser finishes sending it after the tab is gone. Browsers cap the
// in-flight keepalive body at 64 KiB (shared by all keepalive requests from the
// page), so a larger note is simply skipped — the offline queue entry written in
// the same flush covers it on the next load. Never the only safety net.

export const LEAVE_SAVE_URL = "/api/notes/leave-save";

/** Stay under the 64 KiB keepalive quota with headroom for other beacons. */
export const LEAVE_SAVE_MAX_BYTES = 60_000;

export interface LeaveSavePayload {
  /** Which store the note lives in. Absent = "supabase" (older clients). */
  source?: "redis" | "supabase";
  /** Guest notes: the anonymous device id the note is stored under. */
  userId?: string;
  noteId: string;
  content: string;
  goal: number;
  goalType: "" | "words" | "characters";
  /** The version the edit was made from (CAS on the server). */
  baseVersion?: number;
  /** On a conflict the server keeps its note and saves this text as a copy with
   * this id — the same id the offline-queue entry for this edit carries. */
  copyId: string;
  copyStamp: string;
}

/** Serialise the payload, or null when it is too large for a keepalive request. */
export function buildLeaveSaveBody(payload: LeaveSavePayload): string | null {
  const body = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(body).length;
  return bytes <= LEAVE_SAVE_MAX_BYTES ? body : null;
}

/** Fire the keepalive save. Returns whether a request was sent. */
export function sendLeaveSave(payload: LeaveSavePayload): boolean {
  if (typeof fetch === "undefined") return false;
  const body = buildLeaveSaveBody(payload);
  if (!body) return false;
  try {
    fetch(LEAVE_SAVE_URL, {
      method: "POST",
      keepalive: true,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {});
    return true;
  } catch {
    // e.g. the keepalive quota is already used up by another request.
    return false;
  }
}
