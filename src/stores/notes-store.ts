import { create } from "zustand";
import { CombinedNote, NoteSource } from "@/types/combined-notes";

interface NotesStore {
  // State
  notes: CombinedNote[];
  isLoading: boolean;
  animating: boolean;
  newNoteId: string | null;
  isReorderingInProgress: boolean;
  transferringNoteId: string | null;
  lastUpdateTimestamp: number;
  creationError: boolean;
  transferError: boolean;
  isSaving: Map<string, boolean>; // Track which notes are saving
  isEditing: Map<string, boolean>; // NEW: Track which notes are being edited

  // Actions
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
  setEditing: (noteId: string, editing: boolean) => void; // NEW

  // Optimistic updates
  optimisticUpdateNote: (
    noteId: string,
    updates: Partial<CombinedNote>,
  ) => void;
  optimisticAddNote: (note: CombinedNote) => void;
  optimisticDeleteNote: (noteId: string) => void;
  optimisticReorderNotes: (notes: CombinedNote[]) => void;

  // Sync from backend - but preserve optimistic updates
  syncFromBackend: (notes: CombinedNote[]) => void;

  // Smart merge that preserves local edits
  mergeWithBackend: (notes: CombinedNote[]) => void;
}

export const useNotesStore = create<NotesStore>((set, get) => ({
  // Initial state
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
  isEditing: new Map(), // NEW

  // Basic setters
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

  // NEW: Track editing state
  setEditing: (noteId, editing) => {
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

  // Optimistic updates - instant UI feedback
  optimisticUpdateNote: (noteId, updates) => {
    set((state) => ({
      notes: state.notes.map((note) =>
        note.id === noteId
          ? { ...note, ...updates, updatedAt: Date.now() }
          : note,
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

  // Sync from backend - HARD REPLACE (use sparingly)
  syncFromBackend: (notes) => {
    set({
      notes,
      lastUpdateTimestamp: Date.now(),
    });
  },

  // UPDATED: Smart merge - preserves notes being saved OR edited
  mergeWithBackend: (backendNotes) => {
    set((state) => {
      const { isSaving, isEditing } = state;

      // If nothing is saving or being edited, just use backend data
      if (isSaving.size === 0 && isEditing.size === 0) {
        return {
          notes: backendNotes,
          lastUpdateTimestamp: Date.now(),
        };
      }

      // Merge: Keep local version for notes being saved/edited, use backend for others
      const mergedNotes = backendNotes.map((backendNote) => {
        const isNoteSaving = isSaving.has(backendNote.id);
        const isNoteEditing = isEditing.has(backendNote.id);

        if (isNoteSaving || isNoteEditing) {
          // Keep the local version
          const localNote = state.notes.find((n) => n.id === backendNote.id);
          return localNote || backendNote;
        }

        // Use backend version
        return backendNote;
      });

      return {
        notes: mergedNotes,
        lastUpdateTimestamp: Date.now(),
      };
    });
  },
}));
