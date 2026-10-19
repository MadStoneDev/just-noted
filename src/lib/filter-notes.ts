// Shared note filtering + sorting. Extracted from the notes-store so the sidebar
// list and any other note list (e.g. the split-view picker) apply identical
// rules without duplicating the logic. Pure: no store access, no side effects.

import { CombinedNote } from "@/types/combined-notes";
import { Notebook } from "@/types/notebook";
import { sortNotes } from "@/utils/notes-utils";

export type SortBy = "manual" | "edited" | "created" | "title" | "notebook";
export type FilterSource = "all" | "local" | "cloud";
export type FilterPinned = "all" | "pinned" | "unpinned";

export const SORT_LABELS: Record<SortBy, string> = {
  manual: "Manual",
  edited: "Last edited",
  created: "Created",
  title: "Title A–Z",
  notebook: "Notebook",
};

export const SOURCE_LABELS: Record<FilterSource, string> = {
  all: "All sources",
  cloud: "Cloud",
  local: "Local",
};

export interface NoteFilterOpts {
  searchQuery: string;
  filterSource: FilterSource;
  filterPinned: FilterPinned;
  /** null = All Notes, "loose" = unassigned, uuid = specific notebook. */
  activeNotebookId: string | null;
  filterTagIds: string[];
  sortBy: SortBy;
}

export function getDescendantNotebookIds(notebookId: string, notebooks: Notebook[]): string[] {
  return notebooks
    .filter((nb) => nb.parentId === notebookId)
    .map((nb) => nb.id);
}

export function getEffectivelyHiddenNotebookIds(notebooks: Notebook[]): Set<string> {
  const hidden = new Set<string>();
  for (const nb of notebooks) {
    if (nb.isHidden) {
      hidden.add(nb.id);
      for (const child of notebooks) {
        if (child.parentId === nb.id) hidden.add(child.id);
      }
    }
  }
  return hidden;
}

/**
 * Filter + sort a note list. Mirrors exactly what the sidebar shows (minus the
 * trashed notes, which are always excluded here).
 */
export function filterAndSortNotes(
  notes: CombinedNote[],
  notebooks: Notebook[],
  noteTagMap: Record<string, string[]>,
  opts: NoteFilterOpts,
): CombinedNote[] {
  const { searchQuery, filterSource, filterPinned, activeNotebookId, filterTagIds, sortBy } = opts;

  // Exclude trashed notes from main view
  let filtered = notes.filter((n) => !n.deletedAt);

  // Filter by notebook (only applies to Supabase notes)
  if (activeNotebookId === "loose") {
    filtered = filtered.filter((note) => note.source === "supabase" && !note.notebookId);
  } else if (activeNotebookId) {
    const activeNb = notebooks.find((nb) => nb.id === activeNotebookId);
    const descendantIds = getDescendantNotebookIds(activeNotebookId, notebooks);
    let visibleDescendantIds = descendantIds;
    if (activeNb && !activeNb.showHiddenChildren) {
      visibleDescendantIds = descendantIds.filter((cid) => {
        const child = notebooks.find((nb) => nb.id === cid);
        return child && !child.isHidden;
      });
    }
    const allIds = new Set([activeNotebookId, ...visibleDescendantIds]);
    filtered = filtered.filter((note) => note.notebookId && allIds.has(note.notebookId));
  } else {
    // "All Notes" view — exclude notes from hidden notebooks (and children of hidden parents)
    const hiddenNotebookIds = getEffectivelyHiddenNotebookIds(notebooks);
    if (hiddenNotebookIds.size > 0) {
      filtered = filtered.filter(
        (note) => !note.notebookId || !hiddenNotebookIds.has(note.notebookId),
      );
    }
  }

  // Filter by source
  if (filterSource === "local") {
    filtered = filtered.filter((note) => note.source === "redis");
  } else if (filterSource === "cloud") {
    filtered = filtered.filter((note) => note.source === "supabase");
  }

  // Filter by pinned status
  if (filterPinned === "pinned") {
    filtered = filtered.filter((note) => note.isPinned);
  } else if (filterPinned === "unpinned") {
    filtered = filtered.filter((note) => !note.isPinned);
  }

  // Filter by tags
  if (filterTagIds.length > 0) {
    filtered = filtered.filter((note) => {
      const noteTags = noteTagMap[note.id] || [];
      return filterTagIds.some((tagId) => noteTags.includes(tagId));
    });
  }

  // Filter by search query
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (note) =>
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query),
    );
  }

  if (sortBy === "edited") {
    filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  } else if (sortBy === "created") {
    filtered.sort((a, b) => b.createdAt - a.createdAt);
  } else if (sortBy === "title") {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortBy === "notebook") {
    // Group by notebook, pinned notes at the top of each group
    filtered.sort((a, b) => {
      const aName = a.notebookId || "zzz";
      const bName = b.notebookId || "zzz";
      const groupCmp = aName.localeCompare(bName);
      if (groupCmp !== 0) return groupCmp;
      // Within same notebook: pinned first, then by updatedAt
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
    return filtered;
  } else {
    return sortNotes(filtered, null);
  }

  // Keep pinned at top for non-notebook sorts
  const pinned = filtered.filter((n) => n.isPinned);
  const unpinned = filtered.filter((n) => !n.isPinned);
  return [...pinned, ...unpinned];
}
