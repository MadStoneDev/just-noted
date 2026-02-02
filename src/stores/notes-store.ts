// src/stores/notes-store.ts
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { CombinedNote, NoteSource } from "@/types/combined-notes";
import { Notebook } from "@/types/notebook";
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
      ? JSON.parse(localStorage.getItem("splitPaneSizes") || "[50, 50]")
      : [50, 50],

    // ========== Initial UI State ==========
    sidebarOpen: false,
    activeNoteId: null,
    searchQuery: "",
    filterSource: "all",
    filterPinned: "all",

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

    // ========== UI Actions ==========
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    setActiveNoteId: (activeNoteId) => set({ activeNoteId }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setFilterSource: (filterSource) => set({ filterSource }),
    setFilterPinned: (filterPinned) => set({ filterPinned }),
    clearFilters: () => set({ searchQuery: "", filterSource: "all", filterPinned: "all", activeNotebookId: null }),

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
        notes: state.notes.filter((note) => note.id !== noteId),
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

      // Clear the timeout
      if (recentlyDeleted.timeoutId) {
        clearTimeout(recentlyDeleted.timeoutId);
      }

      // Add note back and clear deleted state
      set({
        notes: sortNotes([...notes, restoredNote], null),
        recentlyDeleted: null,
        lastUpdateTimestamp: Date.now(),
      });

      return restoredNote;
    },

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
      const { notes, searchQuery, filterSource, filterPinned, activeNotebookId } = get();

      let filtered = [...notes];

      // Filter by notebook (only applies to Supabase notes)
      // null = "All Notes" (no filtering)
      // "loose" = notes without a notebook (Supabase only)
      // uuid = specific notebook
      if (activeNotebookId === "loose") {
        // Show only Supabase notes without a notebook
        filtered = filtered.filter(
          (note) => note.source === "supabase" && !note.notebookId
        );
      } else if (activeNotebookId) {
        // Show only notes in the specific notebook
        filtered = filtered.filter((note) => note.notebookId === activeNotebookId);
      }
      // activeNotebookId === null means "All Notes" - no notebook filtering

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

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (note) =>
            note.title.toLowerCase().includes(query) ||
            note.content.toLowerCase().includes(query)
        );
      }

      return sortNotes(filtered, null);
    },
  }))
);

// Selector hooks for better performance
export const useFilteredNotes = () => useNotesStore((state) => state.getFilteredNotes());
export const useNoteById = (noteId: string) =>
  useNotesStore((state) => state.notes.find((n) => n.id === noteId));
export const useNotebooks = () => useNotesStore((state) => state.notebooks);
export const useActiveNotebook = () =>
  useNotesStore((state) =>
    state.activeNotebookId && state.activeNotebookId !== "loose"
      ? state.notebooks.find((nb) => nb.id === state.activeNotebookId)
      : null
  );
