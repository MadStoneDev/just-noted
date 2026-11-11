// Pure reconciliation of the local IDB cache against the server's notes, used on
// load. Kept side-effect-free (it only decides) so it can be unit-tested; the
// caller performs the resulting server pushes/deletes. See use-notes-sync.
//
// Rules (by VERSION, never timestamps — a wrong device clock can't flip them):
// - Same text (after normalisation) → server copy, nothing to do.
// - Local holds different text: decided like every background write (see
//   utils/background-conflict). Server still at the local copy's version →
//   keep local and push it as a CAS write. Server moved on, or deleted the
//   note → server copy kept, local text saved as a "(conflicted copy)".
//   Nothing is overwritten either way.
// - A note deleted locally but still present on the server keeps its tombstone
//   and the server delete is finished — never resurrected.
// - A local-only note with content, created within 24h, is kept + pushed
//   (assumed created offline). A local-only tombstone is dropped, never
//   re-pushed. Empty/old local-only notes are dropped.

import type { CombinedNote } from "@/types/combined-notes";
import { sameNoteContent, sameAuthoredContent } from "@/utils/notes-utils";
import { decideBackgroundWrite } from "@/utils/background-conflict";

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
  /** Local-winning notes to push back to the server — each as a background CAS
   * write on its own `version` (the base the server was still at). */
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

/** Reconcile the local cache against the server (rules at the top of file). */
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

    // Nothing unsynced here: take the server copy.
    if (!contentDiffers(localNote, serverNote)) {
      merged.push(serverNote);
      continue;
    }

    // The local copy holds text the server doesn't. Same rule as every other
    // background write (utils/background-conflict): the local version is the
    // base the text was edited from.
    // - server still at that base → keep local and push it (as a CAS write on
    //   that base, so a save racing in after this read still can't be lost)
    // - server moved on, or the note was deleted there → take the server copy
    //   and preserve the local text as a "(conflicted copy)"
    // This also covers a just-typed note whose server copy is still empty: at
    // the same base it's pushed; past it, the local text becomes the copy.
    const decision = decideBackgroundWrite({
      baseVersion: ver(localNote),
      serverVersion: ver(serverNote),
      serverContent: serverNote.content,
      serverDeleted: !!serverNote.deletedAt,
      content: localNote.content ?? "",
    });
    if (decision === "apply") {
      merged.push(localNote);
      toPush.push(localNote);
      continue;
    }
    merged.push(serverNote);
    // A copy only when the local text is genuinely different authored content
    // — never for an empty local copy, or the same words once serialisation /
    // format noise is ignored (e.g. the server copy is our own note
    // re-serialised, or an HTML original a collaborator's editor saved back as
    // Markdown when they merely opened the share).
    if (
      decision === "copy" &&
      hasText(localNote) &&
      !sameAuthoredContent(
        localNote.content,
        localNote.contentFormat,
        serverNote.content,
        serverNote.contentFormat,
      )
    ) {
      toConflictCopy.push(localNote);
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

export interface PendingContent {
  content: string;
  goal: number;
  goalType: "" | "words" | "characters";
  /** Version the queued edit was made from (absent: queued create / legacy). */
  baseVersion?: number;
}

export interface ProtectResult {
  /** The server list with unsynced local content laid over it. */
  notes: CombinedNote[];
  /** Notes whose newer content lives only in this browser's cache — push them. */
  toPush: CombinedNote[];
  /** Notes kept because of a pending offline-queue entry — drain the queue. */
  fromQueue: string[];
}

/**
 * Background refresh / poll guard: a server list must never overwrite a local
 * copy that still has unsynced changes — typically an edit another tab of this
 * browser made just before it was closed. Two signals, strongest first:
 *
 * 1. A pending offline-queue entry for the note (its content is what will be
 *    sent). Shown while the server is still at the entry's base version; the
 *    caller drains the queue to push it. If the server has moved PAST that base
 *    (another device edited), the server copy is shown and kept — the drain then
 *    saves the queued text as a "(conflicted copy)", never over it.
 * 2. A newer local edit in the IDB cache: same base version as the server (or
 *    ahead) but different text. Kept and pushed — as a background CAS write on
 *    the server's version, so a save racing in between still can't be
 *    overwritten (it becomes a conflicted copy).
 *
 * A server that has moved PAST the local base without a queue entry is a real
 * newer edit from elsewhere and wins, as before (conflicts are the load path's
 * job — see reconcileNotes). Tombstones are never revived here.
 */
export function protectUnsyncedLocal(
  serverNotes: CombinedNote[],
  localNotes: CombinedNote[],
  pending: Map<string, PendingContent>,
): ProtectResult {
  const localMap = new Map(localNotes.map((n) => [n.id, n]));
  const toPush: CombinedNote[] = [];
  const fromQueue: string[] = [];

  const notes = serverNotes.map((serverNote) => {
    if (serverNote.deletedAt) return serverNote;

    const queued = pending.get(serverNote.id);
    if (queued) {
      if (sameNoteContent(queued.content, serverNote.content)) return serverNote;
      fromQueue.push(serverNote.id);
      if (typeof queued.baseVersion === "number" && ver(serverNote) > queued.baseVersion) {
        return serverNote;
      }
      return {
        ...serverNote,
        content: queued.content,
        goal: queued.goal,
        goal_type: queued.goalType,
        contentFormat: "markdown" as const,
      };
    }

    const local = localMap.get(serverNote.id);
    if (!local || local.deletedAt) return serverNote;
    if (ver(local) < ver(serverNote)) return serverNote;
    if (!contentDiffers(local, serverNote)) return serverNote;
    // Same guard as the load path: an emptied local copy never blanks text.
    if (!hasText(local) && hasText(serverNote)) return serverNote;
    const kept: CombinedNote = {
      ...serverNote,
      content: local.content,
      goal: local.goal,
      goal_type: local.goal_type,
      contentFormat: local.contentFormat,
    };
    toPush.push(kept);
    return kept;
  });

  return { notes, toPush, fromQueue };
}
