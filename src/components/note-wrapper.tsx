"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";

import Sidebar from "@/components/sidebar";
import ActiveNoteEditor from "@/components/active-note-editor";
import GlobalHeader from "@/components/global-header";
import SearchModal from "@/components/search-modal";
import TrashView from "@/components/trash-view";
import DistractionFreeNoteBlock from "@/components/distraction-free-note-block";
import NotebookBreadcrumb from "@/components/notebook-breadcrumb";
import SharedNoteInline from "@/components/shared-note-inline";
import NotebooksGrid from "@/components/notebooks-grid";
import SettingsView from "@/components/settings-view";
import { readEditorFont, applyEditorFont, readEditorFontSize, applyEditorFontSize } from "@/utils/editor-font";
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
  IconChevronRight,
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
  // Read-only shared note open in the main area (by shortcode)
  const [sharedShortcode, setSharedShortcode] = useState<string | null>(null);
  // Notebooks cover grid open in the main area
  const [showNotebooksGrid, setShowNotebooksGrid] = useState(false);
  // In-shell settings view open in the main area
  const [showSettings, setShowSettings] = useState(false);

  // Apply the saved editor font + size once on load.
  useEffect(() => {
    applyEditorFont(readEditorFont());
    applyEditorFontSize(readEditorFontSize());
  }, []);

  // Cross-component triggers from the rail.
  useEffect(() => {
    const openGrid = () => setShowNotebooksGrid(true);
    // Settings replaces the notes sidebar (its own section list stands in for it).
    const openSettings = () => { setShowSettings(true); setSidebarOpen(false); };
    const openSearch = () => setShowSearch(true);
    const openHelp = () => { window.open("/the-how", "_blank"); };
    window.addEventListener("justnoted:open-notebooks-grid", openGrid);
    window.addEventListener("justnoted:open-settings", openSettings);
    window.addEventListener("justnoted:open-search", openSearch);
    window.addEventListener("justnoted:open-help", openHelp);
    return () => {
      window.removeEventListener("justnoted:open-notebooks-grid", openGrid);
      window.removeEventListener("justnoted:open-settings", openSettings);
      window.removeEventListener("justnoted:open-search", openSearch);
      window.removeEventListener("justnoted:open-help", openHelp);
    };
  }, []);

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

  // Phase 0 — flush pending edits when the tab is hidden or closed.
  // visibilitychange→hidden is the signal browsers reliably deliver before a
  // tab is discarded (and while the page is still alive, so async saves can
  // complete); pagehide is the backup for bfcache/navigation. beforeunload
  // alone is not dependable for saving.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") handleForceSave();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", handleForceSave);
    // Explicit flush request (e.g. just before logout, while still authenticated).
    window.addEventListener("justnoted:flush", handleForceSave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", handleForceSave);
      window.removeEventListener("justnoted:flush", handleForceSave);
    };
  }, [handleForceSave]);


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

      {/* Marketing header is kept only on mobile for now; on desktop the
          permanent rail owns navigation (design handoff). */}
      <div className="md:hidden">
        <GlobalHeader
          user={isAuthenticated ? ({ id: userId } as any) : null}
          appMode
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onSearch={() => setShowSearch(true)}
          onNewNote={() => notesOperations.addNote()}
        />
      </div>

      {/* Shell: permanent rail + collapsible sidebar column + editor. */}
      <div className="flex mt-14 md:mt-0 h-[calc(100dvh-56px)] md:h-dvh">
        {/* Sidebar (its own icon rail owns primary navigation) */}
        <Sidebar
          onNoteClick={() => setSharedShortcode(null)}
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
          onOpenShared={(shortcode) => {
            setSharedShortcode(shortcode);
            if (typeof window !== "undefined" && window.innerWidth < 768) {
              setSidebarOpen(false);
            }
          }}
        />

        {/* Mobile: slim edge tab to reopen the sidebar when it's collapsed,
            so the editor keeps full width while writing. */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Show notes"
            title="Show notes"
            className="mobile-peek md:hidden fixed left-0 top-1/2 z-30 w-[18px] h-[46px] flex items-center justify-center rounded-r-[9px] text-white shadow-[var(--shadow-lg)]"
          >
            <IconChevronRight size={13} strokeWidth={2.4} className="-ml-[3px]" />
          </button>
        )}

        {/* Main area: the editor, or a read-only shared note when one is open. */}
        <main
          id="main-content"
          className="flex-1 flex flex-col min-w-0 bg-[var(--color-canvas)]"
          role="main"
          aria-label={sharedShortcode ? "Shared note" : "Note editor"}
        >
          {showSettings ? (
            <SettingsView onClose={() => { setShowSettings(false); setSidebarOpen(true); }} />
          ) : showTrash ? (
            <TrashView onClose={() => setShowTrash(false)} />
          ) : showNotebooksGrid ? (
            <NotebooksGrid
              onClose={() => setShowNotebooksGrid(false)}
              onOpenNotebook={(id) => {
                const s = useNotesStore.getState();
                s.setActiveNotebookId(id);
                s.setSidebarOpen(true);
                // Switch the sidebar back to the notes list, filtered to this notebook.
                window.dispatchEvent(new Event("justnoted:show-notes"));
                setShowNotebooksGrid(false);
              }}
              onNewNotebook={() =>
                window.dispatchEvent(new Event("justnoted:new-notebook"))
              }
            />
          ) : sharedShortcode ? (
            <SharedNoteInline
              shortcode={sharedShortcode}
              onClose={() => setSharedShortcode(null)}
            />
          ) : (
            <ActiveNoteEditor
              userId={userId || ""}
              isAuthenticated={isAuthenticated}
              notesOperations={notesOperations}
              registerNoteFlush={registerNoteFlush}
              unregisterNoteFlush={unregisterNoteFlush}
            />
          )}
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
