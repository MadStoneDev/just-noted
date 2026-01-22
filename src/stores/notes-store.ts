// src/stores/notes-store.ts
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { CombinedNote, NoteSource } from "@/types/combined-notes";
import { sortNotes } from "@/utils/notes-utils";

// Deleted note with timestamp for undo functionality
interface DeletedNote {
  note: CombinedNote;
  deletedAt: number;
  timeoutId?: NodeJS.Timeout;
}

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
    clearFilters: () => set({ searchQuery: "", filterSource: "all", filterPinned: "all" }),

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
      const { notes, searchQuery, filterSource, filterPinned } = get();

      let filtered = [...notes];

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
