"use client";

import React, { useState, useCallback, useMemo } from "react";

import JustNotes from "@/components/just-notes";
import DistractionFreeNoteBlock from "@/components/distraction-free-note-block";
import SplitViewNoteBlock from "@/components/split-view-note-block";
import Sidebar from "@/components/sidebar";
import NotebookBreadcrumb from "@/components/notebook-breadcrumb";
import NotebookModal from "@/components/notebook-modal";
import UndoDeleteToast from "@/components/ui/undo-toast";
import { GlobalSaveIndicator } from "@/components/ui/save-indicator";
import OfflineIndicator, { OfflineStatusBadge } from "@/components/ui/offline-indicator";
import { updateNotebook, deleteNotebook } from "@/app/actions/notebookActions";
import { createClient } from "@/utils/supabase/client";
import { CoverType } from "@/types/notebook";

import {
  IconArrowsMinimize,
  IconViewportNarrow,
  IconViewportWide,
  IconMenu2,
  IconKeyboard,
} from "@tabler/icons-react";

import { CombinedNote } from "@/types/combined-notes";
import { NotesErrorBoundary } from "@/components/error-boundary";
import { useNotesSync } from "@/hooks/use-notes-sync";
import { useNotesOperations } from "@/hooks/use-notes-operations";
import { useKeyboardShortcuts, KEYBOARD_SHORTCUTS } from "@/hooks/use-keyboard-shortcuts";
import { useNotesStore } from "@/stores/notes-store";
import { SkipLinks } from "@/hooks/use-accessibility";

export default function NoteWrapper() {
  // Initialize sync and get user info
  const {
    userId,
    isAuthenticated,
    refreshNotes,
    registerNoteFlush,
    unregisterNoteFlush,
    noteFlushFunctions,
  } = useNotesSync();

  // Get operations
  const notesOperations = useNotesOperations(
    userId,
    isAuthenticated,
    refreshNotes,
    noteFlushFunctions
  );

  // UI State from Zustand
  const { toggleSidebar, setSidebarOpen, activeNoteId, notes, updateNotebook: updateNotebookInStore, removeNotebook, recalculateNotebookCounts } = useNotesStore();

  // Get active notebook for editing via breadcrumb
  const activeNotebook = useNotesStore((state) => {
    const { activeNotebookId, notebooks } = state;
    if (!activeNotebookId || activeNotebookId === "loose") return null;
    return notebooks.find((n) => n.id === activeNotebookId) || null;
  });

  // Local states for distraction-free mode
  const [activeNote, setActiveNote] = useState<CombinedNote | null>(null);
  const [fullWidth, setFullWidth] = useState(true);
  const [showDistractionFree, setShowDistractionFree] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Local states for split view mode
  const [splitViewNote, setSplitViewNote] = useState<CombinedNote | null>(null);
  const [showSplitView, setShowSplitView] = useState(false);
  const [isSplitAnimating, setIsSplitAnimating] = useState(false);

  // Local states for notebook edit modal (from breadcrumb)
  const [showNotebookModal, setShowNotebookModal] = useState(false);

  // Handlers for distraction-free mode
  const handleShowDistractionFree = useCallback((note: CombinedNote) => {
    setActiveNote(note);
    setShowDistractionFree(true);

    requestAnimationFrame(() => {
      setIsAnimating(true);
    });
  }, []);

  const handleHideDistractionFree = useCallback(() => {
    setIsAnimating(false);

    setTimeout(() => {
      setShowDistractionFree(false);
      setActiveNote(null);
    }, 300);
  }, []);

  const handleToggleWidth = useCallback(() => {
    setFullWidth((prev) => !prev);
  }, []);

  // Handlers for split view mode
  const handleShowSplitView = useCallback((note: CombinedNote) => {
    setSplitViewNote(note);
    setShowSplitView(true);

    requestAnimationFrame(() => {
      setIsSplitAnimating(true);
    });
  }, []);

  const handleHideSplitView = useCallback(() => {
    setIsSplitAnimating(false);

    setTimeout(() => {
      setShowSplitView(false);
      setSplitViewNote(null);
    }, 300);
  }, []);

  // Force save all notes
  const handleForceSave = useCallback(() => {
    noteFlushFunctions.current.forEach((flushFn) => {
      try {
        flushFn();
      } catch (e) {
        console.error("Failed to flush note:", e);
      }
    });
  }, [noteFlushFunctions]);

  // Notebook modal handlers for breadcrumb
  const handleOpenNotebookModal = useCallback(() => {
    if (activeNotebook) {
      setShowNotebookModal(true);
    }
  }, [activeNotebook]);

  const handleCloseNotebookModal = useCallback(() => {
    setShowNotebookModal(false);
  }, []);

  // Helper to upload cover using client-side Supabase
  const uploadCoverFile = async (notebookId: string, file: File): Promise<string | null> => {
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError) {
        console.error("Auth error:", authError);
        return null;
      }
      if (!user) {
        console.error("User not authenticated");
        return null;
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const filePath = `${user.id}/${notebookId}-${Date.now()}.${ext}`;

      console.log("Uploading cover to:", filePath, "File size:", file.size, "Type:", file.type);

      // Delete existing covers for this notebook
      const { data: existingFiles, error: listError } = await supabase.storage
        .from("notebook-covers")
        .list(user.id, { search: notebookId });

      if (listError) {
        console.error("Error listing existing files:", listError);
      }

      if (existingFiles && existingFiles.length > 0) {
        const filesToDelete = existingFiles.map((f) => `${user.id}/${f.name}`);
        console.log("Deleting existing files:", filesToDelete);
        await supabase.storage.from("notebook-covers").remove(filesToDelete);
      }

      // Upload new file
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("notebook-covers")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        console.error("Upload error details:", JSON.stringify(uploadError, null, 2));
        return null;
      }

      console.log("Upload successful:", uploadData);

      const { data: { publicUrl } } = supabase.storage
        .from("notebook-covers")
        .getPublicUrl(filePath);

      console.log("Public URL:", publicUrl);

      return publicUrl;
    } catch (error) {
      console.error("Upload error:", error);
      return null;
    }
  };

  const handleSaveNotebook = useCallback(async (data: {
    name: string;
    coverType: CoverType;
    coverValue: string;
    pendingFile?: File | null;
  }) => {
    if (!activeNotebook) return;

    let finalCoverType = data.coverType;
    let finalCoverValue = data.coverValue;

    // Upload pending file if exists
    if (data.pendingFile) {
      console.log("Uploading pending file for notebook:", activeNotebook.id);
      const uploadedUrl = await uploadCoverFile(activeNotebook.id, data.pendingFile);
      if (uploadedUrl) {
        finalCoverType = "custom";
        finalCoverValue = uploadedUrl;
        console.log("Upload successful, cover URL:", uploadedUrl);
      } else {
        console.error("Failed to upload cover file");
        throw new Error("Failed to upload cover image. Please try again.");
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
        const notes = useNotesStore.getState().notes;
        const note = notes.find((n) => n.id === activeNoteId);
        if (note) {
          handleShowDistractionFree(note);
        }
      }
    },
    onToggleSplitView: () => {
      if (showSplitView) {
        handleHideSplitView();
      } else if (activeNoteId) {
        const notes = useNotesStore.getState().notes;
        const note = notes.find((n) => n.id === activeNoteId);
        if (note) {
          handleShowSplitView(note);
        }
      }
    },
    onSearch: () => setSidebarOpen(true),
  });

  // Handle note click from sidebar
  const handleNoteClick = useCallback((noteId: string) => {
    // Note scrolling is handled in the Sidebar component
  }, []);

  const widthButtonText = useMemo(() => (fullWidth ? "Compact" : "Expanded"), [fullWidth]);
  const widthButtonIcon = useMemo(
    () =>
      fullWidth ? (
        <IconViewportNarrow size={18} strokeWidth={2} />
      ) : (
        <IconViewportWide size={18} strokeWidth={2} />
      ),
    [fullWidth]
  );

  return (
    <NotesErrorBoundary>
      {/* Skip links for keyboard users */}
      <SkipLinks />

      {/* Sidebar */}
      <Sidebar onNoteClick={handleNoteClick} />

      {/* Main content area */}
      <main id="main-content" className="relative" role="main" aria-label="Notes application">
        {/* Top bar with sidebar toggle and save indicator */}
        <div className="sticky top-16 z-30 bg-white/80 backdrop-blur-sm border-b border-neutral-200 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
              title="Toggle sidebar (Ctrl+B)"
            >
              <IconMenu2 size={20} />
            </button>
            <GlobalSaveIndicator />
            <OfflineStatusBadge />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowShortcuts(!showShortcuts)}
              className="p-2 rounded-lg hover:bg-neutral-100 transition-colors text-neutral-500"
              title="Keyboard shortcuts"
            >
              <IconKeyboard size={20} />
            </button>
          </div>
        </div>

        {/* Notebook breadcrumb - shows when viewing specific notebook */}
        <NotebookBreadcrumb onEditNotebook={handleOpenNotebookModal} />

        {/* Keyboard shortcuts help */}
        {showShortcuts && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            onClick={(e) => e.target === e.currentTarget && setShowShortcuts(false)}
          >
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
              <h3 id="shortcuts-title" className="text-lg font-semibold mb-4">Keyboard Shortcuts</h3>
              <div className="space-y-2">
                {KEYBOARD_SHORTCUTS.map((shortcut, index) => (
                  <div key={index} className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0">
                    <span className="text-neutral-600">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <React.Fragment key={keyIndex}>
                          <kbd className="px-2 py-1 bg-neutral-100 rounded text-sm font-mono">
                            {key}
                          </kbd>
                          {keyIndex < shortcut.keys.length - 1 && (
                            <span className="text-neutral-400">+</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowShortcuts(false)}
                className="mt-4 w-full py-2 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Notes grid */}
        <div id="notes-list" className="pt-4" aria-label="Notes list">
          <JustNotes
            openDistractionFreeNote={handleShowDistractionFree}
            openSplitViewNote={handleShowSplitView}
            userId={userId}
            isAuthenticated={isAuthenticated}
            notesOperations={notesOperations}
            registerNoteFlush={registerNoteFlush}
            unregisterNoteFlush={unregisterNoteFlush}
          />
        </div>
      </main>

      {/* Distraction-free mode */}
      {showDistractionFree && (
        <section
          className={`fixed inset-0 z-50 transition-opacity duration-300 ease-in-out ${
            isAnimating ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="absolute inset-0 bg-neutral-900/30" onClick={handleHideDistractionFree} />

          <article className="absolute inset-6 sm:inset-8 p-2 pb-16 rounded-xl bg-neutral-200 overflow-hidden">
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex justify-center items-center gap-2 w-full z-10">
              <button
                className="cursor-pointer px-4 py-2 flex items-center gap-2 rounded-full bg-white/90 hover:bg-white shadow-lg opacity-80 hover:opacity-100 transition-all duration-200 ease-in-out"
                onClick={handleToggleWidth}
              >
                {widthButtonIcon}
                <span className="hidden sm:block">{widthButtonText}</span>
              </button>

              <button
                className="cursor-pointer px-4 py-2 flex items-center gap-2 rounded-full bg-white/90 hover:bg-white shadow-lg opacity-80 hover:opacity-100 transition-all duration-200 ease-in-out"
                onClick={handleHideDistractionFree}
              >
                <IconArrowsMinimize size={18} strokeWidth={2} />
                <span className="hidden sm:block">Close Distraction-Free Mode</span>
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

      {/* Split view mode */}
      {showSplitView && (
        <section
          className={`fixed inset-0 z-50 transition-opacity duration-300 ease-in-out ${
            isSplitAnimating ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="absolute inset-0 bg-neutral-900/30" onClick={handleHideSplitView} />

          <article className="absolute inset-6 sm:inset-8 p-2 pb-16 rounded-xl bg-neutral-200 overflow-hidden">
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex justify-center items-center gap-2 w-full z-10">
              <button
                className="cursor-pointer px-4 py-2 flex items-center gap-2 rounded-full bg-white/90 hover:bg-white shadow-lg opacity-80 hover:opacity-100 transition-all duration-200 ease-in-out"
                onClick={handleHideSplitView}
              >
                <IconArrowsMinimize size={18} strokeWidth={2} />
                <span className="hidden sm:block">Close Split View</span>
              </button>
            </div>

            <div className="h-full overflow-hidden">
              <SplitViewNoteBlock
                note={splitViewNote}
                userId={userId || ""}
                isAuthenticated={isAuthenticated}
                notesOperations={notesOperations}
                registerNoteFlush={registerNoteFlush}
                unregisterNoteFlush={unregisterNoteFlush}
              />
            </div>
          </article>
        </section>
      )}

      {/* Undo delete toast */}
      <UndoDeleteToast />

      {/* Offline indicator */}
      <OfflineIndicator />

      {/* Notebook edit modal (from breadcrumb) */}
      <NotebookModal
        isOpen={showNotebookModal}
        onClose={handleCloseNotebookModal}
        notebook={activeNotebook}
        onSave={handleSaveNotebook}
        onDelete={handleDeleteNotebook}
      />
    </NotesErrorBoundary>
  );
}
