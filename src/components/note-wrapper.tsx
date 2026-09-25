"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";

import Sidebar from "@/components/sidebar";
import ActiveNoteEditor from "@/components/active-note-editor";
import { MobileTabBar, MobileEditorNav, MobileFab, type MobileTab } from "@/components/mobile-chrome";
import HelpModal from "@/components/help-modal";
import SearchModal from "@/components/search-modal";
import TrashView from "@/components/trash-view";
import DistractionFreeNoteBlock from "@/components/distraction-free-note-block";
import NotebookBreadcrumb from "@/components/notebook-breadcrumb";
import SharedNoteInline from "@/components/shared-note-inline";
import NotebooksGrid from "@/components/notebooks-grid";
import SettingsView from "@/components/settings-view";
import RoadmapView from "@/components/roadmap-view";
import { readEditorFont, applyEditorFont, readEditorFontSize, applyEditorFontSize } from "@/utils/editor-font";
import { captureCurrentAccount } from "@/utils/accounts";
import { createClient } from "@/utils/supabase/client";
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
  // Standalone Roadmap page (kanban), opened from the rail.
  const [showRoadmap, setShowRoadmap] = useState(false);
  // In-shell settings view open in the main area
  const [showSettings, setShowSettings] = useState(false);
  // Deep-link target section for Settings (e.g. from an upgrade upsell).
  const [settingsSection, setSettingsSection] = useState<string | undefined>(undefined);
  // Which bottom-tab is highlighted on mobile (design surface 08).
  const [mobileTab, setMobileTab] = useState<MobileTab>("notes");

  // Apply the saved editor font + size once on load.
  useEffect(() => {
    applyEditorFont(readEditorFont());
    applyEditorFontSize(readEditorFontSize());
  }, []);

  // Remember whether the main area last showed a shared note, and restore it on
  // reload. activeNoteId / justnoted_last_note only cover the user's own notes,
  // so without this a refresh drops a shared note back to the last own-note.
  const sharedRestoredRef = useRef(false);
  useEffect(() => {
    try {
      const sc = localStorage.getItem("justnoted_last_shared");
      if (sc) setSharedShortcode(sc);
    } catch {}
    sharedRestoredRef.current = true;
  }, []);
  useEffect(() => {
    if (!sharedRestoredRef.current) return; // don't clobber before the restore runs
    try {
      if (sharedShortcode) localStorage.setItem("justnoted_last_shared", sharedShortcode);
      else localStorage.removeItem("justnoted_last_shared");
    } catch {}
  }, [sharedShortcode]);

  // Record the current account (fresh tokens) into the device store so it's
  // listed in the account switcher and switchable later. Re-capture on token
  // refresh so the active account's stored session never goes stale (Supabase
  // rotates refresh tokens).
  useEffect(() => {
    const supabase = createClient();
    captureCurrentAccount(supabase).catch(() => {});
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        captureCurrentAccount(supabase).catch(() => {});
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Cross-component triggers from the rail.
  useEffect(() => {
    const openGrid = () => setShowNotebooksGrid(true);
    // Settings replaces the notes sidebar (its own section list stands in for it).
    // An optional string detail deep-links to a section (e.g. "Plan & usage").
    const openSettings = (e: Event) => {
      setShowSettings(true);
      setSidebarOpen(false);
      const detail = (e as CustomEvent).detail;
      if (typeof detail === "string") setSettingsSection(detail);
    };
    const openSearch = () => setShowSearch(true);
    // Help opens the in-app Help modal (listens for the same event).
    const openHelp = () => {};
    const openRoadmap = () => { setShowRoadmap(true); setSidebarOpen(false); };
    window.addEventListener("justnoted:open-notebooks-grid", openGrid);
    window.addEventListener("justnoted:open-settings", openSettings);
    window.addEventListener("justnoted:open-search", openSearch);
    window.addEventListener("justnoted:open-help", openHelp);
    window.addEventListener("justnoted:open-roadmap", openRoadmap);
    return () => {
      window.removeEventListener("justnoted:open-notebooks-grid", openGrid);
      window.removeEventListener("justnoted:open-settings", openSettings);
      window.removeEventListener("justnoted:open-search", openSearch);
      window.removeEventListener("justnoted:open-help", openHelp);
      window.removeEventListener("justnoted:open-roadmap", openRoadmap);
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

  // ===== Mobile bottom-tab navigation (design surface 08) =====
  const goNotes = useCallback(() => {
    setShowSettings(false);
    setShowRoadmap(false);
    setShowTrash(false);
    setShowNotebooksGrid(false);
    setSharedShortcode(null);
    useNotesStore.getState().setActiveNotebookId(null);
    window.dispatchEvent(new Event("justnoted:show-notes"));
    setSidebarOpen(true);
    setMobileTab("notes");
  }, [setSidebarOpen]);

  const goNotebooks = useCallback(() => {
    setShowSettings(false);
    setShowRoadmap(false);
    setShowTrash(false);
    setSharedShortcode(null);
    setShowNotebooksGrid(true);
    setSidebarOpen(false);
    setMobileTab("notebooks");
  }, [setSidebarOpen]);

  const goShared = useCallback(() => {
    setShowSettings(false);
    setShowRoadmap(false);
    setShowTrash(false);
    setShowNotebooksGrid(false);
    setSharedShortcode(null);
    window.dispatchEvent(new Event("justnoted:show-shared"));
    setSidebarOpen(true);
    setMobileTab("shared");
  }, [setSidebarOpen]);

  const goYou = useCallback(() => {
    setShowTrash(false);
    setShowNotebooksGrid(false);
    setShowRoadmap(false);
    setSharedShortcode(null);
    setShowSettings(true);
    setSidebarOpen(false);
    setMobileTab("you");
  }, [setSidebarOpen]);

  const mobileNewNote = useCallback(() => {
    notesOperations.addNote();
    setSidebarOpen(false);
    setMobileTab("notes");
  }, [notesOperations, setSidebarOpen]);

  const openFocusForActive = useCallback(() => {
    if (!activeNoteId) return;
    const note = notes.find((n) => n.id === activeNoteId);
    if (note) handleShowDistractionFree(note);
  }, [activeNoteId, notes, handleShowDistractionFree]);

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
    // Escape closes the top open main-area layer first; the hook then handles
    // the sidebar on the next press. Order = visual stacking, most-recent first.
    onEscape: () => {
      if (showRoadmap) { setShowRoadmap(false); setSidebarOpen(true); return true; }
      if (showSettings) { setShowSettings(false); setSidebarOpen(true); setSettingsSection(undefined); return true; }
      if (showTrash) { setShowTrash(false); setSidebarOpen(true); return true; }
      if (showNotebooksGrid) { setShowNotebooksGrid(false); setSidebarOpen(true); return true; }
      if (sharedShortcode) { setSharedShortcode(null); setSidebarOpen(true); return true; }
      return false;
    },
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

      {/* Shell: on desktop the rail owns navigation; on mobile a bottom tab bar
          (design surface 08) sits below the rail+sidebar+editor row. */}
      <div className="flex flex-col h-dvh">
      <div className="flex flex-1 min-h-0">
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
          onTogglePin={(noteId, isPinned) => notesOperations.updatePinStatus(noteId, isPinned)}
          onOpenShared={(shortcode) => {
            setSharedShortcode(shortcode);
            if (typeof window !== "undefined" && window.innerWidth < 768) {
              setSidebarOpen(false);
            }
          }}
        />

        {/* Main area: the editor, or a read-only shared note when one is open. */}
        <main
          id="main-content"
          className="flex-1 flex flex-col min-w-0 bg-[var(--color-canvas)]"
          role="main"
          aria-label={sharedShortcode ? "Shared note" : "Note editor"}
        >
          {showRoadmap ? (
            <RoadmapView onClose={() => { setShowRoadmap(false); setSidebarOpen(true); }} />
          ) : showSettings ? (
            <SettingsView
              initialSection={settingsSection}
              onClose={() => { setShowSettings(false); setSidebarOpen(true); setSettingsSection(undefined); }}
            />
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
              onEditCover={(id) =>
                window.dispatchEvent(new CustomEvent("justnoted:edit-notebook", { detail: id }))
              }
              onDropNote={(noteId, notebookId) => {
                const s = useNotesStore.getState();
                s.optimisticUpdateNote(noteId, { notebookId });
                s.recalculateNotebookCounts();
                import("@/app/actions/notebookActions").then(({ bulkAssignNotesToNotebook }) => {
                  bulkAssignNotesToNotebook([noteId], notebookId);
                });
              }}
            />
          ) : sharedShortcode ? (
            <SharedNoteInline
              shortcode={sharedShortcode}
              onClose={() => setSharedShortcode(null)}
            />
          ) : (
            <>
              {/* Mobile editor nav (design surface 08) — desktop uses its own toolbar. */}
              <MobileEditorNav
                onBack={() => { setSidebarOpen(true); setMobileTab("notes"); }}
                onFocus={openFocusForActive}
                onShare={() => window.dispatchEvent(new Event("justnoted:open-share"))}
                onMore={() => window.dispatchEvent(new Event("justnoted:open-note-actions"))}
              />
              <ActiveNoteEditor
                userId={userId || ""}
                isAuthenticated={isAuthenticated}
                notesOperations={notesOperations}
                registerNoteFlush={registerNoteFlush}
                unregisterNoteFlush={unregisterNoteFlush}
              />
            </>
          )}
        </main>
      </div>

        {/* Mobile bottom tab bar (design surface 08). */}
        <MobileTabBar
          active={mobileTab}
          onNotes={goNotes}
          onNotebooks={goNotebooks}
          onShared={goShared}
          onYou={goYou}
        />
      </div>

      {/* Mobile FAB — new note, shown on the notes list only. */}
      {sidebarOpen && !showRoadmap && !showSettings && !showTrash && !showNotebooksGrid && !sharedShortcode && (
        <MobileFab onClick={mobileNewNote} />
      )}

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
      <HelpModal />
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
