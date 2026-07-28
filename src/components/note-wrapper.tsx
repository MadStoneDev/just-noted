"use client";

import React, { useState, useCallback, useMemo } from "react";

import Sidebar from "@/components/sidebar";
import ActiveNoteEditor from "@/components/active-note-editor";
import GlobalHeader from "@/components/global-header";
import SearchModal from "@/components/search-modal";
import TrashView from "@/components/trash-view";
import DistractionFreeNoteBlock from "@/components/distraction-free-note-block";
import NotebookBreadcrumb from "@/components/notebook-breadcrumb";
import NotebookModal from "@/components/notebook-modal";
import UndoDeleteToast from "@/components/ui/undo-toast";
import OfflineIndicator from "@/components/ui/offline-indicator";
import { updateNotebook, deleteNotebook } from "@/app/actions/notebookActions";
import { uploadNotebookCover } from "@/utils/storage/cover-upload";
import { CoverType } from "@/types/notebook";

import {
  IconArrowsMinimize,
  IconViewportNarrow,
  IconViewportWide,
  IconLayoutSidebarLeftCollapse,
  IconSearch,
  IconPlus,
} from "@tabler/icons-react";

import { CombinedNote } from "@/types/combined-notes";
import { NotesErrorBoundary } from "@/components/error-boundary";
import { useNotesSync } from "@/hooks/use-notes-sync";
import { useNotesOperations } from "@/hooks/use-notes-operations";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useNotesStore } from "@/stores/notes-store";
import { SkipLinks } from "@/hooks/use-accessibility";

export default function NoteWrapper() {
  const {
    userId,
    isAuthenticated,
    refreshNotes,
    registerNoteFlush,
    unregisterNoteFlush,
    noteFlushFunctions,
  } = useNotesSync();

  const notesOperations = useNotesOperations(
    userId,
    isAuthenticated,
    refreshNotes,
    noteFlushFunctions,
  );

  const sidebarOpen = useNotesStore((s) => s.sidebarOpen);
  const toggleSidebar = useNotesStore((s) => s.toggleSidebar);
  const setSidebarOpen = useNotesStore((s) => s.setSidebarOpen);
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const notes = useNotesStore((s) => s.notes);
  const updateNotebookInStore = useNotesStore((s) => s.updateNotebook);
  const removeNotebook = useNotesStore((s) => s.removeNotebook);
  const recalculateNotebookCounts = useNotesStore((s) => s.recalculateNotebookCounts);

  const activeNotebook = useNotesStore((state) => {
    const { activeNotebookId, notebooks } = state;
    if (!activeNotebookId || activeNotebookId === "loose") return null;
    return notebooks.find((n) => n.id === activeNotebookId) || null;
  });

  // Distraction-free mode
  const [activeNote, setActiveNote] = useState<CombinedNote | null>(null);
  const [fullWidth, setFullWidth] = useState(true);
  const [showDistractionFree, setShowDistractionFree] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);


  // Notebook modal
  const [showNotebookModal, setShowNotebookModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showTrash, setShowTrash] = useState(false);

  const handleShowDistractionFree = useCallback((note: CombinedNote) => {
    setActiveNote(note);
    setShowDistractionFree(true);
    requestAnimationFrame(() => setIsAnimating(true));
  }, []);

  const handleHideDistractionFree = useCallback(() => {
    setIsAnimating(false);
    setTimeout(() => {
      setShowDistractionFree(false);
      setActiveNote(null);
    }, 300);
  }, []);


  const handleForceSave = useCallback(() => {
    noteFlushFunctions.current.forEach((flushFn) => {
      try { flushFn(); } catch {}
    });
  }, [noteFlushFunctions]);


  const handleSaveNotebook = useCallback(async (data: {
    name: string;
    coverType: CoverType;
    coverValue: string;
    pendingFile?: File | null;
  }) => {
    if (!activeNotebook) return;

    let finalCoverType = data.coverType;
    let finalCoverValue = data.coverValue;

    if (data.pendingFile) {
      const uploadedUrl = await uploadNotebookCover(activeNotebook.id, data.pendingFile);
      if (uploadedUrl) {
        finalCoverType = "custom";
        finalCoverValue = uploadedUrl;
      } else {
        throw new Error("Failed to upload cover image.");
      }
    }

    const result = await updateNotebook(activeNotebook.id, {
      name: data.name,
      coverType: finalCoverType,
      coverValue: finalCoverValue,
    });

    if (result.success && result.notebook) {
      updateNotebookInStore(activeNotebook.id, result.notebook);
    } else {
      throw new Error(result.error || "Failed to update notebook");
    }
  }, [activeNotebook, updateNotebookInStore]);

  const handleDeleteNotebook = useCallback(async () => {
    if (!activeNotebook) return;
    const result = await deleteNotebook(activeNotebook.id);
    if (result.success) {
      removeNotebook(activeNotebook.id);
      recalculateNotebookCounts();
    } else {
      throw new Error(result.error || "Failed to delete notebook");
    }
  }, [activeNotebook, removeNotebook, recalculateNotebookCounts]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNewNote: notesOperations.addNote,
    onSave: handleForceSave,
    onToggleDistractionFree: () => {
      if (showDistractionFree) {
        handleHideDistractionFree();
      } else if (activeNoteId) {
        const note = notes.find((n) => n.id === activeNoteId);
        if (note) handleShowDistractionFree(note);
      }
    },
    onToggleSplitView: undefined,
    onSearch: () => setShowSearch(true),
  });

  const widthButtonIcon = useMemo(
    () => fullWidth
      ? <IconViewportNarrow size={16} strokeWidth={2} />
      : <IconViewportWide size={16} strokeWidth={2} />,
    [fullWidth],
  );

  return (
    <NotesErrorBoundary>
      <SkipLinks />

      {/* Unified header */}
      <GlobalHeader
        user={isAuthenticated ? ({ id: userId } as any) : null}
        appMode
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onSearch={() => setShowSearch(true)}
        onNewNote={() => notesOperations.addNote()}
      />

      {/* Two-panel layout: rail + sidebar + editor */}
      <div className="flex mt-14 h-[calc(100dvh-56px)]">
        {/* Collapsed rail — visible on desktop when sidebar is closed */}
        <div
          className={`hidden md:flex flex-col items-center py-3 gap-1.5 bg-[var(--color-bg-secondary)] border-r border-[var(--color-border-secondary)] flex-shrink-0 transition-all duration-[var(--duration-slow)] ${
            sidebarOpen ? "w-0 opacity-0 border-r-0 overflow-hidden pointer-events-none" : "w-12 opacity-100"
          }`}
          style={{ transitionTimingFunction: "var(--ease-spring)" }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors duration-[var(--duration-fast)] text-[var(--color-text-tertiary)]"
            aria-label="Expand sidebar (Ctrl+\)"
            title="Expand sidebar (Ctrl+\)"
          >
            <IconLayoutSidebarLeftCollapse size={16} className="rotate-180" />
          </button>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors duration-[var(--duration-fast)] text-[var(--color-text-tertiary)]"
            aria-label="Search notes"
            title="Search"
          >
            <IconSearch size={16} />
          </button>
          <button
            onClick={() => {
              setSidebarOpen(true);
              notesOperations.addNote();
            }}
            className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors duration-[var(--duration-fast)] text-[var(--color-text-tertiary)]"
            aria-label="New note (Ctrl+J)"
            title="New note (Ctrl+J)"
          >
            <IconPlus size={16} />
          </button>
        </div>

        {/* Sidebar */}
        <Sidebar
          onNoteClick={() => {}}
          onBulkDelete={(noteIds) => {
            noteIds.forEach((id) => notesOperations.deleteNote(id));
          }}
          onDeleteNote={(noteId) => notesOperations.deleteNote(noteId)}
          onMoveNote={(noteId, notebookId) => {
            const { optimisticUpdateNote, recalculateNotebookCounts } = useNotesStore.getState();
            optimisticUpdateNote(noteId, { notebookId });
            recalculateNotebookCounts();
            import("@/app/actions/notebookActions").then(({ bulkAssignNotesToNotebook }) => {
              bulkAssignNotesToNotebook([noteId], notebookId);
            });
          }}
          onOpenTrash={() => setShowTrash(true)}
          onNewNote={() => notesOperations.addNote()}
        />

        {/* Main editor area */}
        <main
          id="main-content"
          className="flex-1 flex flex-col min-w-0 bg-[var(--color-bg-primary)]"
          role="main"
          aria-label="Note editor"
        >
          <ActiveNoteEditor
            userId={userId || ""}
            isAuthenticated={isAuthenticated}
            notesOperations={notesOperations}
            registerNoteFlush={registerNoteFlush}
            unregisterNoteFlush={unregisterNoteFlush}
          />
        </main>
      </div>

      {/* Distraction-free mode */}
      {showDistractionFree && (
        <section
          className={`fixed inset-0 z-50 transition-opacity duration-300 ease-in-out ${
            isAnimating ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="absolute inset-0 bg-[var(--color-bg-overlay)]" onClick={handleHideDistractionFree} />
          <article className="absolute inset-4 sm:inset-8 p-2 pb-16 rounded-[var(--radius-xl)] bg-[var(--color-bg-secondary)] overflow-hidden">
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex justify-center items-center gap-2 w-full z-10">
              <button
                className="cursor-pointer px-3 py-2 flex items-center gap-2 rounded-full bg-[var(--color-bg-elevated)]/90 hover:bg-[var(--color-bg-elevated)] shadow-[var(--shadow-lg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-sm transition-all duration-[var(--duration-fast)]"
                onClick={() => setFullWidth((p) => !p)}
              >
                {widthButtonIcon}
                <span className="hidden sm:block">{fullWidth ? "Compact" : "Expanded"}</span>
              </button>
              <button
                className="cursor-pointer px-3 py-2 flex items-center gap-2 rounded-full bg-[var(--color-bg-elevated)]/90 hover:bg-[var(--color-bg-elevated)] shadow-[var(--shadow-lg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-sm transition-all duration-[var(--duration-fast)]"
                onClick={handleHideDistractionFree}
              >
                <IconArrowsMinimize size={16} strokeWidth={2} />
                <span className="hidden sm:block">Exit Focus Mode</span>
              </button>
            </div>
            <DistractionFreeNoteBlock
              note={activeNote}
              fullWidth={fullWidth}
              userId={userId}
              isAuthenticated={isAuthenticated}
              notesOperations={notesOperations}
              registerNoteFlush={registerNoteFlush}
              unregisterNoteFlush={unregisterNoteFlush}
            />
          </article>
        </section>
      )}

      {/* Split view */}

      <UndoDeleteToast />
      <OfflineIndicator />
      <SearchModal open={showSearch} onClose={() => setShowSearch(false)} />
      <TrashView open={showTrash} onClose={() => setShowTrash(false)} />

      <NotebookModal
        isOpen={showNotebookModal}
        onClose={() => setShowNotebookModal(false)}
        notebook={activeNotebook}
        onSave={handleSaveNotebook}
        onDelete={handleDeleteNotebook}
      />
    </NotesErrorBoundary>
  );
}
