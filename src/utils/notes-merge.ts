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
import { sameNoteContent } from "@/utils/notes-utils";

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

const hasText = (n: CombinedNote): boolean =>
  !!(n.content && n.content.trim().length > 0);

const ver = (n: CombinedNote): number => n.version ?? 1;

// Use the same normalisation as the save no-op: content that differs only by
// line endings or trailing whitespace is NOT a real difference, so it must not
// trigger a push or — worse — a spurious "(conflicted copy)".
const contentDiffers = (a: CombinedNote, b: CombinedNote): boolean =>
  !sameNoteContent(a.content, b.content);

export interface ReconcileResult {
  /** The list to show and cache. */
  merged: CombinedNote[];
  /** Local-winning notes to push back to the server. */
  toPush: CombinedNote[];
  /** Local tombstones whose server-side delete still needs finishing. */
  toDelete: CombinedNote[];
  /**
   * Background conflicts: the server advanced past our base version AND our
   * local copy still holds different, un-pushed text. We take the server copy
   * and the caller saves THIS local copy as a "(conflicted copy)" so nothing is
   * lost (per the load/reconcile branch of the conflict policy).
   */
  toConflictCopy: CombinedNote[];
}

/**
 * Reconcile the local cache against the server by VERSION (not timestamps — a
 * wrong device clock can't flip the winner). Empty server content never
 * clobbers non-empty local content (safety net retained).
 */
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
  const toConflictCopy: CombinedNote[] = [];

  for (const serverNote of serverNotes) {
    const localNote = localMap.get(serverNote.id);
    if (!localNote) {
      merged.push(serverNote);
      continue;
    }
    if (localNote.deletedAt && !serverNote.deletedAt) {
      // Deleted locally but still on the server — honour the deletion.
      merged.push(localNote);
      toDelete.push(localNote);
      continue;
    }

    const lv = ver(localNote);
    const sv = ver(serverNote);

    // Safety net: an empty server copy never overwrites local text, whatever the
    // versions say (guards a write that hasn't durably landed).
    if (!hasText(serverNote) && hasText(localNote)) {
      merged.push(localNote);
      toPush.push(localNote);
    } else if (lv > sv) {
      // Local is ahead (e.g. an edit made offline) — keep and push it.
      merged.push(localNote);
      toPush.push(localNote);
    } else if (lv === sv) {
      // Same base. Differing content means an unsynced local edit — keep & push
      // (a CAS on this base will succeed). Otherwise take the server copy.
      if (contentDiffers(localNote, serverNote)) {
        merged.push(localNote);
        toPush.push(localNote);
      } else {
        merged.push(serverNote);
      }
    } else {
      // Server advanced past our base. Take the server copy; if we also hold
      // different un-pushed text, preserve it as a conflicted copy.
      merged.push(serverNote);
      if (contentDiffers(localNote, serverNote) && hasText(localNote)) {
        toConflictCopy.push(localNote);
      }
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

  return { merged, toPush, toDelete, toConflictCopy };
}
