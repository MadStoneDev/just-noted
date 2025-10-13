// src/utils/notes-utils.ts
import { CombinedNote } from "@/types/combined-notes";

/**
 * Sort notes by order, pin status, and timestamps
 */
export function sortNotes(notesToSort: CombinedNote[]): CombinedNote[] {
  const handleOrderZero = (a: CombinedNote, b: CombinedNote): number => {
    if (a.order === 0 && b.order !== 0) return -1;
    if (a.order !== 0 && b.order === 0) return 1;
    if (a.order === 0 && b.order === 0) return b.updatedAt - a.updatedAt;
    return 0;
  };

  const handlePinStatus = (a: CombinedNote, b: CombinedNote): number => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  };

  const handleOrderNumber = (a: CombinedNote, b: CombinedNote): number => {
    if (a.order > 0 && b.order <= 0) return -1;
    if (a.order <= 0 && b.order > 0) return 1;
    if (a.order > 0 && b.order > 0) return a.order - b.order;
    return b.updatedAt - a.updatedAt;
  };

  return [...notesToSort].sort((a, b) => {
    const orderZeroResult = handleOrderZero(a, b);
    if (orderZeroResult !== 0) return orderZeroResult;

    const pinResult = handlePinStatus(a, b);
    if (pinResult !== 0) return pinResult;

    return handleOrderNumber(a, b);
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
