"use client";

import React, { useState, useCallback, useMemo } from "react";

import JustNotes from "@/components/just-notes";
import DistractionFreeNoteBlock from "@/components/distraction-free-note-block";
import Sidebar from "@/components/sidebar";
import UndoDeleteToast from "@/components/ui/undo-toast";
import { GlobalSaveIndicator } from "@/components/ui/save-indicator";
import OfflineIndicator, { OfflineStatusBadge } from "@/components/ui/offline-indicator";
import AIAnalysisButton from "@/components/ui/ai-analysis";

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
  const { toggleSidebar, setSidebarOpen, activeNoteId, notes } = useNotesStore();

  // Local states for distraction-free mode
  const [activeNote, setActiveNote] = useState<CombinedNote | null>(null);
  const [fullWidth, setFullWidth] = useState(true);
  const [showDistractionFree, setShowDistractionFree] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

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
        <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-sm border-b border-neutral-200 px-3 py-2 flex items-center justify-between">
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
            {/* AI Analysis Button */}
            <AIAnalysisButton
              userId={userId}
              notes={notes}
              currentNoteId={activeNoteId || undefined}
            />

            <button
              onClick={() => setShowShortcuts(!showShortcuts)}
              className="p-2 rounded-lg hover:bg-neutral-100 transition-colors text-neutral-500"
              title="Keyboard shortcuts"
            >
              <IconKeyboard size={20} />
            </button>
          </div>
        </div>

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
        <div id="notes-list" aria-label="Notes list">
          <JustNotes
            openDistractionFreeNote={handleShowDistractionFree}
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

      {/* Undo delete toast */}
      <UndoDeleteToast />

      {/* Offline indicator */}
      <OfflineIndicator />
    </NotesErrorBoundary>
  );
}
