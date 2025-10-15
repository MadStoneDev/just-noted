// src/utils/notes-utils.ts
import { CombinedNote } from "@/types/combined-notes";

/**
 * Sort notes by order, pin status, and timestamps
 * New notes (identified by newNoteId) always appear at the top
 */
export function sortNotes(
  notesToSort: CombinedNote[],
  newNoteId?: string | null,
): CombinedNote[] {
  return [...notesToSort].sort((a, b) => {
    // PRIORITY 1: New note always at the very top
    if (newNoteId) {
      if (a.id === newNoteId) return -1;
      if (b.id === newNoteId) return 1;
    }

    // PRIORITY 2: Order 0 notes (newly created, not yet synced)
    const aIsOrderZero = a.order === 0;
    const bIsOrderZero = b.order === 0;

    if (aIsOrderZero && !bIsOrderZero) return -1;
    if (!aIsOrderZero && bIsOrderZero) return 1;

    // If both are order 0, sort by newest first (by createdAt)
    if (aIsOrderZero && bIsOrderZero) {
      return b.createdAt - a.createdAt;
    }

    // PRIORITY 3: Pinned status
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    // PRIORITY 4: Order number (for notes with order > 0)
    if (a.order > 0 && b.order > 0) {
      return a.order - b.order;
    }

    // PRIORITY 5: Fall back to updated timestamp (newest first)
    return b.updatedAt - a.updatedAt;
  });
}

/**
 * Normalize note ordering to sequential numbers
 */
export function normaliseOrdering(
  notesToNormalise: CombinedNote[],
): CombinedNote[] {
  const orderZeroNotes = notesToNormalise.filter((note) => note.order === 0);
  const regularNotes = notesToNormalise.filter((note) => note.order > 0);

  const sortedRegular = [...regularNotes].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.createdAt - b.createdAt;
  });

  const pinnedRegular = sortedRegular.filter((note) => note.isPinned);
  const unpinnedRegular = sortedRegular.filter((note) => !note.isPinned);
  const pinnedOrderZero = orderZeroNotes.filter((note) => note.isPinned);
  const unpinnedOrderZero = orderZeroNotes.filter((note) => !note.isPinned);

  const finalOrder = [
    ...pinnedRegular,
    ...pinnedOrderZero.sort((a, b) => b.createdAt - a.createdAt),
    ...unpinnedOrderZero.sort((a, b) => b.createdAt - a.createdAt),
    ...unpinnedRegular,
  ];

  return finalOrder.map((note, index) => ({ ...note, order: index + 1 }));
}
