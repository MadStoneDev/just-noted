// src/stores/notes-store.ts
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { CombinedNote, NoteSource } from "@/types/combined-notes";
import { Notebook } from "@/types/notebook";
import { Tag } from "@/types/tag";
import { TocHeading } from "@/lib/toc-parser";
import { sortNotes } from "@/utils/notes-utils";

// Deleted note with timestamp for undo functionality
interface DeletedNote {
  note: CombinedNote;
  deletedAt: number;
  timeoutId?: NodeJS.Timeout;
}

// Active notebook filter type: null = "All Notes", "loose" = unassigned notes, uuid = specific notebook
type ActiveNotebookFilter = string | null;

interface NotesStore {
  // ========== User State ==========
  userId: string | null;
  isAuthenticated: boolean;

  // ========== Notes State ==========
  notes: CombinedNote[];
  isLoading: boolean;
  animating: boolean;
  newNoteId: string | null;
  isReorderingInProgress: boolean;
  transferringNoteId: string | null;
  lastUpdateTimestamp: number;
  creationError: boolean;
  transferError: boolean;
  isSaving: Map<string, boolean>;
  isEditing: Map<string, boolean>;
  saveError: Map<string, boolean>;

  // ========== Notebook State ==========
  notebooks: Notebook[];
  activeNotebookId: ActiveNotebookFilter; // null = "All Notes", "loose" = loose notes, uuid = specific notebook
  notebooksLoading: boolean;
  notebookCounts: Record<string, number>; // notebook id -> note count
  looseNotesCount: number;

  // ========== ToC State ==========
  tocVisible: boolean;
  tocHeadings: TocHeading[];
  activeHeadingId: string | null;

  // ========== Split View State ==========
  splitViewEnabled: boolean;
  splitViewDirection: "horizontal" | "vertical";
  referenceNoteId: string | null;
  referenceNoteEditable: boolean;
  splitPaneSizes: [number, number]; // percentages [main, reference]

  // ========== UI State ==========
  sidebarOpen: boolean;
  activeNoteId: string | null;
  searchQuery: string;
  filterSource: "all" | "local" | "cloud";
  filterPinned: "all" | "pinned" | "unpinned";
  sortBy: "manual" | "edited" | "created" | "title" | "notebook";
  setSortBy: (sort: NotesStore["sortBy"]) => void;

  // ========== Tags State ==========
  tags: Tag[];
  noteTagMap: Record<string, string[]>;
  tagsLoading: boolean;
  filterTagIds: string[];

  // ========== Undo Delete ==========
  recentlyDeleted: DeletedNote | null;

  // ========== User Actions ==========
  setUserId: (userId: string | null) => void;
  setAuthenticated: (authenticated: boolean) => void;

  // ========== Notes Actions ==========
  setNotes: (notes: CombinedNote[]) => void;
  setLoading: (loading: boolean) => void;
  setAnimating: (animating: boolean) => void;
  setNewNoteId: (id: string | null) => void;
  setReordering: (reordering: boolean) => void;
  setTransferring: (id: string | null) => void;
  markUpdated: () => void;
  setCreationError: (error: boolean) => void;
  setTransferError: (error: boolean) => void;
  setSaving: (noteId: string, saving: boolean) => void;
  setEditing: (noteId: string, editing: boolean) => void;
  setSaveError: (noteId: string, hasError: boolean) => void;

  // ========== UI Actions ==========
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveNoteId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterSource: (filter: "all" | "local" | "cloud") => void;
  setFilterPinned: (filter: "all" | "pinned" | "unpinned") => void;
  clearFilters: () => void;

  // ========== Notebook Actions ==========
  setNotebooks: (notebooks: Notebook[]) => void;
  setActiveNotebookId: (id: ActiveNotebookFilter) => void;
  setNotebooksLoading: (loading: boolean) => void;
  addNotebook: (notebook: Notebook) => void;
  updateNotebook: (id: string, updates: Partial<Notebook>) => void;
  removeNotebook: (id: string) => void;
  updateNotebookCounts: (counts: Record<string, number>, looseCount: number) => void;
  recalculateNotebookCounts: () => void;

  // ========== ToC Actions ==========
  setTocVisible: (visible: boolean) => void;
  toggleToc: () => void;
  setTocHeadings: (headings: TocHeading[]) => void;
  setActiveHeadingId: (id: string | null) => void;

  // ========== Split View Actions ==========
  setSplitViewEnabled: (enabled: boolean) => void;
  toggleSplitView: () => void;
  setSplitViewDirection: (direction: "horizontal" | "vertical") => void;
  setReferenceNoteId: (noteId: string | null) => void;
  setReferenceNoteEditable: (editable: boolean) => void;
  setSplitPaneSizes: (sizes: [number, number]) => void;

  // ========== Optimistic Updates ==========
  optimisticUpdateNote: (noteId: string, updates: Partial<CombinedNote>) => void;
  optimisticAddNote: (note: CombinedNote) => void;
  optimisticDeleteNote: (noteId: string) => void;
  optimisticReorderNotes: (notes: CombinedNote[]) => void;

  // ========== Undo Delete ==========
  setRecentlyDeleted: (note: CombinedNote | null, timeoutId?: NodeJS.Timeout) => void;
  clearRecentlyDeleted: () => void;
  restoreDeletedNote: () => CombinedNote | null;

  // ========== Tags Actions ==========
  setTags: (tags: Tag[]) => void;
  addTag: (tag: Tag) => void;
  updateTagInStore: (id: string, updates: Partial<Tag>) => void;
  removeTag: (id: string) => void;
  setNoteTagMap: (map: Record<string, string[]>) => void;
  assignTagToNoteInStore: (noteId: string, tagId: string) => void;
  removeTagFromNoteInStore: (noteId: string, tagId: string) => void;
  setFilterTagIds: (tagIds: string[]) => void;
  setTagsLoading: (loading: boolean) => void;

  // ========== Sync ==========
  syncFromBackend: (notes: CombinedNote[]) => void;
  mergeWithBackend: (notes: CombinedNote[]) => void;

  // ========== Computed/Selectors ==========
  getFilteredNotes: () => CombinedNote[];
}

export const useNotesStore = create<NotesStore>()(
  subscribeWithSelector((set, get) => ({
    // ========== Initial User State ==========
    userId: null,
    isAuthenticated: false,

    // ========== Initial Notes State ==========
    notes: [],
    isLoading: true,
    animating: false,
    newNoteId: null,
    isReorderingInProgress: false,
    transferringNoteId: null,
    lastUpdateTimestamp: Date.now(),
    creationError: false,
    transferError: false,
    isSaving: new Map(),
    isEditing: new Map(),
    saveError: new Map(),

    // ========== Initial Notebook State ==========
    notebooks: [],
    activeNotebookId: null,
    notebooksLoading: false,
    notebookCounts: {},
    looseNotesCount: 0,

    // ========== Initial ToC State ==========
    tocVisible: typeof window !== "undefined"
      ? localStorage.getItem("tocVisible") === "true"
      : false,
    tocHeadings: [],
    activeHeadingId: null,

    // ========== Initial Split View State ==========
    splitViewEnabled: false,
    splitViewDirection: typeof window !== "undefined"
      ? (localStorage.getItem("splitViewDirection") as "horizontal" | "vertical") || "horizontal"
      : "horizontal",
    referenceNoteId: typeof window !== "undefined"
      ? localStorage.getItem("referenceNoteId")
      : null,
    referenceNoteEditable: typeof window !== "undefined"
      ? localStorage.getItem("referenceNoteEditable") === "true"
      : false,
    splitPaneSizes: typeof window !== "undefined"
      ? (() => {
          try {
            return JSON.parse(localStorage.getItem("splitPaneSizes") || "[50, 50]") as [number, number];
          } catch {
            return [50, 50] as [number, number];
          }
        })()
      : [50, 50],

    // ========== Initial UI State ==========
    sidebarOpen: true,
    activeNoteId: null,
    searchQuery: "",
    filterSource: "all",
    filterPinned: "all",
    sortBy: (typeof window !== "undefined" && localStorage.getItem("justnoted_sort") as any) || "manual",
    setSortBy: (sort) => {
      localStorage.setItem("justnoted_sort", sort);
      set({ sortBy: sort });
    },

    // ========== Initial Tags State ==========
    tags: [],
    noteTagMap: {},
    tagsLoading: false,
    filterTagIds: [],

    // ========== Initial Undo State ==========
    recentlyDeleted: null,

    // ========== User Actions ==========
    setUserId: (userId) => set({ userId }),
    setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),

    // ========== Notes Actions ==========
    setNotes: (notes) => set({ notes }),
    setLoading: (isLoading) => set({ isLoading }),
    setAnimating: (animating) => set({ animating }),
    setNewNoteId: (newNoteId) => set({ newNoteId }),
    setReordering: (isReorderingInProgress) => set({ isReorderingInProgress }),
    setTransferring: (transferringNoteId) => set({ transferringNoteId }),
    markUpdated: () => set({ lastUpdateTimestamp: Date.now() }),

    setCreationError: (creationError) => {
      set({ creationError });
      if (creationError) {
        setTimeout(() => set({ creationError: false }), 3000);
      }
    },

    setTransferError: (transferError) => {
      set({ transferError });
      if (transferError) {
        setTimeout(() => set({ transferError: false }), 3000);
      }
    },

    setSaving: (noteId, saving) => {
      const { isSaving } = get();
      const currentValue = isSaving.has(noteId);
      if (saving === currentValue) return;

      set((state) => {
        const newSaving = new Map(state.isSaving);
        if (saving) {
          newSaving.set(noteId, true);
        } else {
          newSaving.delete(noteId);
        }
        return { isSaving: newSaving };
      });
    },

    setEditing: (noteId, editing) => {
      const { isEditing } = get();
      const currentValue = isEditing.has(noteId);
      if (editing === currentValue) return;

      set((state) => {
        const newEditing = new Map(state.isEditing);
        if (editing) {
          newEditing.set(noteId, true);
        } else {
          newEditing.delete(noteId);
        }
        return { isEditing: newEditing };
      });
    },

    setSaveError: (noteId, hasError) => {
      set((state) => {
        const newSaveError = new Map(state.saveError);
        if (hasError) {
          newSaveError.set(noteId, true);
        } else {
          newSaveError.delete(noteId);
        }
        return { saveError: newSaveError };
      });
    },

    // ========== UI Actions ==========
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    setActiveNoteId: (activeNoteId) => set({ activeNoteId }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setFilterSource: (filterSource) => set({ filterSource }),
    setFilterPinned: (filterPinned) => set({ filterPinned }),
    clearFilters: () => set({ searchQuery: "", filterSource: "all", filterPinned: "all", activeNotebookId: null, filterTagIds: [] }),

    // ========== Notebook Actions ==========
    setNotebooks: (notebooks) => set({ notebooks }),
    setActiveNotebookId: (activeNotebookId) => set({ activeNotebookId }),
    setNotebooksLoading: (notebooksLoading) => set({ notebooksLoading }),

    addNotebook: (notebook) => {
      set((state) => ({
        notebooks: [...state.notebooks, notebook],
      }));
    },

    updateNotebook: (id, updates) => {
      set((state) => ({
        notebooks: state.notebooks.map((nb) =>
          nb.id === id ? { ...nb, ...updates, updatedAt: Date.now() } : nb
        ),
      }));
    },

    removeNotebook: (id) => {
      set((state) => ({
        notebooks: state.notebooks.filter((nb) => nb.id !== id),
        // If the deleted notebook was active, go back to "All Notes"
        activeNotebookId: state.activeNotebookId === id ? null : state.activeNotebookId,
      }));
    },

    updateNotebookCounts: (counts, looseCount) => {
      set({ notebookCounts: counts, looseNotesCount: looseCount });
    },

    recalculateNotebookCounts: () => {
      const { notes } = get();
      const counts: Record<string, number> = {};
      let looseCount = 0;

      for (const note of notes) {
        // Only count Supabase notes for notebook counts
        if (note.source === "supabase") {
          if (note.notebookId) {
            counts[note.notebookId] = (counts[note.notebookId] || 0) + 1;
          } else {
            looseCount++;
          }
        }
      }

      set({ notebookCounts: counts, looseNotesCount: looseCount });
    },

    // ========== ToC Actions ==========
    setTocVisible: (tocVisible) => {
      if (typeof window !== "undefined") {
        localStorage.setItem("tocVisible", String(tocVisible));
      }
      set({ tocVisible });
    },
    toggleToc: () => {
      const newValue = !get().tocVisible;
      if (typeof window !== "undefined") {
        localStorage.setItem("tocVisible", String(newValue));
      }
      set({ tocVisible: newValue });
    },
    setTocHeadings: (tocHeadings) => set({ tocHeadings }),
    setActiveHeadingId: (activeHeadingId) => set({ activeHeadingId }),

    // ========== Split View Actions ==========
    setSplitViewEnabled: (splitViewEnabled) => set({ splitViewEnabled }),
    toggleSplitView: () => set((state) => ({ splitViewEnabled: !state.splitViewEnabled })),
    setSplitViewDirection: (splitViewDirection) => {
      if (typeof window !== "undefined") {
        localStorage.setItem("splitViewDirection", splitViewDirection);
      }
      set({ splitViewDirection });
    },
    setReferenceNoteId: (referenceNoteId) => {
      if (typeof window !== "undefined") {
        if (referenceNoteId) {
          localStorage.setItem("referenceNoteId", referenceNoteId);
        } else {
          localStorage.removeItem("referenceNoteId");
        }
      }
      set({ referenceNoteId });
    },
    setReferenceNoteEditable: (referenceNoteEditable) => {
      if (typeof window !== "undefined") {
        localStorage.setItem("referenceNoteEditable", String(referenceNoteEditable));
      }
      set({ referenceNoteEditable });
    },
    setSplitPaneSizes: (splitPaneSizes) => {
      if (typeof window !== "undefined") {
        localStorage.setItem("splitPaneSizes", JSON.stringify(splitPaneSizes));
      }
      set({ splitPaneSizes });
    },

    // ========== Optimistic Updates ==========
    optimisticUpdateNote: (noteId, updates) => {
      set((state) => ({
        notes: state.notes.map((note) =>
          note.id === noteId
            ? { ...note, ...updates, updatedAt: Date.now() }
            : note
        ),
        lastUpdateTimestamp: Date.now(),
      }));
    },

    optimisticAddNote: (note) => {
      set((state) => ({
        notes: [...state.notes, note],
        lastUpdateTimestamp: Date.now(),
      }));
    },

    optimisticDeleteNote: (noteId) => {
      set((state) => ({
        notes: state.notes.map((note) =>
          note.id === noteId
            ? { ...note, deletedAt: Date.now() }
            : note
        ),
        lastUpdateTimestamp: Date.now(),
      }));
    },

    optimisticReorderNotes: (notes) => {
      set({
        notes,
        lastUpdateTimestamp: Date.now(),
      });
    },

    // ========== Undo Delete ==========
    setRecentlyDeleted: (note, timeoutId) => {
      const { recentlyDeleted } = get();
      // Clear previous timeout if exists
      if (recentlyDeleted?.timeoutId) {
        clearTimeout(recentlyDeleted.timeoutId);
      }

      if (note) {
        set({
          recentlyDeleted: {
            note,
            deletedAt: Date.now(),
            timeoutId,
          },
        });
      } else {
        set({ recentlyDeleted: null });
      }
    },

    clearRecentlyDeleted: () => {
      const { recentlyDeleted } = get();
      if (recentlyDeleted?.timeoutId) {
        clearTimeout(recentlyDeleted.timeoutId);
      }
      set({ recentlyDeleted: null });
    },

    restoreDeletedNote: () => {
      const { recentlyDeleted, notes } = get();
      if (!recentlyDeleted) return null;

      const restoredNote = recentlyDeleted.note;

      if (recentlyDeleted.timeoutId) {
        clearTimeout(recentlyDeleted.timeoutId);
      }

      // Clear deletedAt on the note to restore it
      set({
        notes: notes.map((n) =>
          n.id === restoredNote.id ? { ...n, deletedAt: null } : n
        ),
        recentlyDeleted: null,
        lastUpdateTimestamp: Date.now(),
      });

      return restoredNote;
    },

    // ========== Tags Actions ==========
    setTags: (tags) => set({ tags }),
    addTag: (tag) => set((state) => ({ tags: [...state.tags, tag] })),
    updateTagInStore: (id, updates) =>
      set((state) => ({
        tags: state.tags.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      })),
    removeTag: (id) =>
      set((state) => ({
        tags: state.tags.filter((t) => t.id !== id),
        noteTagMap: Object.fromEntries(
          Object.entries(state.noteTagMap).map(([noteId, tagIds]) => [
            noteId,
            tagIds.filter((tid) => tid !== id),
          ]),
        ),
        filterTagIds: state.filterTagIds.filter((tid) => tid !== id),
      })),
    setNoteTagMap: (noteTagMap) => set({ noteTagMap }),
    assignTagToNoteInStore: (noteId, tagId) =>
      set((state) => {
        const current = state.noteTagMap[noteId] || [];
        if (current.includes(tagId)) return state;
        return {
          noteTagMap: { ...state.noteTagMap, [noteId]: [...current, tagId] },
        };
      }),
    removeTagFromNoteInStore: (noteId, tagId) =>
      set((state) => {
        const current = state.noteTagMap[noteId] || [];
        return {
          noteTagMap: {
            ...state.noteTagMap,
            [noteId]: current.filter((tid) => tid !== tagId),
          },
        };
      }),
    setFilterTagIds: (filterTagIds) => set({ filterTagIds }),
    setTagsLoading: (tagsLoading) => set({ tagsLoading }),

    // ========== Sync ==========
    syncFromBackend: (notes) => {
      set({
        notes,
        lastUpdateTimestamp: Date.now(),
      });
    },

    mergeWithBackend: (backendNotes) => {
      set((state) => {
        const { isSaving, isEditing } = state;

        if (isSaving.size === 0 && isEditing.size === 0) {
          return {
            notes: backendNotes,
            lastUpdateTimestamp: Date.now(),
          };
        }

        const mergedNotes = backendNotes.map((backendNote) => {
          const isNoteSaving = isSaving.has(backendNote.id);
          const isNoteEditing = isEditing.has(backendNote.id);

          if (isNoteSaving || isNoteEditing) {
            const localNote = state.notes.find((n) => n.id === backendNote.id);
            return localNote || backendNote;
          }

          return backendNote;
        });

        return {
          notes: mergedNotes,
          lastUpdateTimestamp: Date.now(),
        };
      });
    },

    // ========== Computed/Selectors ==========
    getFilteredNotes: () => {
      const { notes, searchQuery, filterSource, filterPinned, activeNotebookId, filterTagIds, noteTagMap, notebooks } = get();

      // Exclude trashed notes from main view
      let filtered = notes.filter((n) => !n.deletedAt);

      // Filter by notebook (only applies to Supabase notes)
      if (activeNotebookId === "loose") {
        filtered = filtered.filter(
          (note) => note.source === "supabase" && !note.notebookId
        );
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
            (note) => !note.notebookId || !hiddenNotebookIds.has(note.notebookId)
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
            note.content.toLowerCase().includes(query)
        );
      }

      const { sortBy } = get();

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
    },
  }))
);

function getDescendantNotebookIds(notebookId: string, notebooks: Notebook[]): string[] {
  return notebooks
    .filter((nb) => nb.parentId === notebookId)
    .map((nb) => nb.id);
}

function getEffectivelyHiddenNotebookIds(notebooks: Notebook[]): Set<string> {
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

// Memoized filtered notes cache
let _filteredNotesCache: CombinedNote[] = [];
let _filteredNotesCacheKey = "";

function computeFilteredNotesCacheKey(state: {
  notes: CombinedNote[];
  searchQuery: string;
  filterSource: string;
  filterPinned: string;
  activeNotebookId: string | null;
  filterTagIds: string[];
  noteTagMap: Record<string, string[]>;
}): string {
  const noteTagFingerprint = Object.keys(state.noteTagMap).length;
  return `${state.notes.length}:${state.notes.map((n) => n.id + n.isPinned + n.source + n.notebookId + n.updatedAt).join(",")}:${state.searchQuery}:${state.filterSource}:${state.filterPinned}:${state.activeNotebookId}:${state.filterTagIds.join(",")}:${noteTagFingerprint}`;
}

// Selector hooks for better performance
export const useFilteredNotes = () =>
  useNotesStore((state) => {
    const cacheKey = computeFilteredNotesCacheKey(state);
    if (cacheKey === _filteredNotesCacheKey) {
      return _filteredNotesCache;
    }
    const result = state.getFilteredNotes();
    _filteredNotesCacheKey = cacheKey;
    _filteredNotesCache = result;
    return result;
  });
export const useNoteById = (noteId: string) =>
  useNotesStore((state) => state.notes.find((n) => n.id === noteId));
export const useNotebooks = () => useNotesStore((state) => state.notebooks);
export const useActiveNotebook = () =>
  useNotesStore((state) =>
    state.activeNotebookId && state.activeNotebookId !== "loose"
      ? state.notebooks.find((nb) => nb.id === state.activeNotebookId)
      : null
  );
