"use server";

import {
  loadCollabState,
  saveCollabState,
  type CollabTarget,
} from "@/lib/collab-access";

/**
 * Persistence for the collaborative Yjs document (design surface 05).
 * The Y.Doc state (base64) is the source of truth for a shared note; every
 * client loads the SAME state and merges deltas, so no re-seeding / duplication.
 * Access is derived from the server session, not client-passed ids.
 *
 * NOTE: the READ now also has a Route Handler (/api/collab) so clients can load
 * the doc off the server-action queue. This action remains for any direct
 * callers; the write stays a server action.
 */

type Target = CollabTarget;

export async function loadCollabDoc(target: Target): Promise<{ state: string | null }> {
  return loadCollabState(target);
}

export async function saveCollabDoc(target: Target & { state: string }): Promise<{ ok: boolean }> {
  return saveCollabState(target);
}
