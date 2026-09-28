// Pure reconciliation of the local IDB cache against the server's notes, used on
// load. Kept side-effect-free (it only decides) so it can be unit-tested; the
// caller performs the resulting server pushes/deletes. See use-notes-sync.
//
// Rules:
// - Server wins on a tie / when newer, EXCEPT empty server content never
//   clobbers a local copy that still has text (guards a just-typed note whose
//   edit hasn't durably reached the server, and any silent write failure).
// - Local wins when strictly newer (and is pushed back).
// - A note deleted locally but still present on the server keeps its tombstone
//   and the server delete is finished — never resurrected.
// - A local-only note with content, created within 24h, is kept + pushed
//   (assumed created offline). A local-only tombstone is dropped, never
//   re-pushed. Empty/old local-only notes are dropped.

import type { CombinedNote } from "@/types/combined-notes";

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

const hasText = (n: CombinedNote): boolean =>
  !!(n.content && n.content.trim().length > 0);

export interface ReconcileResult {
  /** The list to show and cache. */
  merged: CombinedNote[];
  /** Local-winning notes to push back to the server. */
  toPush: CombinedNote[];
  /** Local tombstones whose server-side delete still needs finishing. */
  toDelete: CombinedNote[];
}

export function reconcileNotes(
  serverNotes: CombinedNote[],
  localNotes: CombinedNote[],
  now: number = Date.now(),
): ReconcileResult {
  const serverMap = new Map(serverNotes.map((n) => [n.id, n]));
  const localMap = new Map(localNotes.map((n) => [n.id, n]));
  const merged: CombinedNote[] = [];
  const toPush: CombinedNote[] = [];
  const toDelete: CombinedNote[] = [];

  for (const serverNote of serverNotes) {
    const localNote = localMap.get(serverNote.id);
    if (!localNote) {
      merged.push(serverNote);
    } else if (localNote.deletedAt && !serverNote.deletedAt) {
      merged.push(localNote);
      toDelete.push(localNote);
    } else if (localNote.updatedAt > serverNote.updatedAt) {
      merged.push(localNote);
      toPush.push(localNote);
    } else if (!hasText(serverNote) && hasText(localNote)) {
      merged.push(localNote);
      toPush.push(localNote);
    } else {
      merged.push(serverNote);
    }
  }

  for (const localNote of localNotes) {
    if (serverMap.has(localNote.id)) continue;
    if (localNote.deletedAt) continue;
    if (hasText(localNote) && now - localNote.createdAt < TWENTY_FOUR_HOURS) {
      merged.push(localNote);
      toPush.push(localNote);
    }
  }

  return { merged, toPush, toDelete };
}
