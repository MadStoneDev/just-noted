"use client";

import React, { useCallback, useMemo, useState } from "react";

import NoteBlock from "@/components/note-block";
import NoteTemplates from "@/components/ui/note-templates";
import { CombinedNote, NoteSource } from "@/types/combined-notes";
import { useNotesStore } from "@/stores/notes-store";
import { NotesOperations } from "@/hooks/use-notes-operations";

import { IconSquareRoundedPlus, IconRefresh, IconTemplate } from "@tabler/icons-react";

interface JustNotesProps {
  openDistractionFreeNote?: (note: CombinedNote) => void;
  openSplitViewNote?: (note: CombinedNote) => void;
  userId: string | null;
  isAuthenticated: boolean;
  notesOperations: NotesOperations;
  registerNoteFlush: (noteId: string, flushFn: () => void) => void;
  unregisterNoteFlush: (noteId: string) => void;
}

export default function JustNotes({
  openDistractionFreeNote,
  openSplitViewNote,
  userId,
  isAuthenticated,
  notesOperations,
  registerNoteFlush,
  unregisterNoteFlush,
}: JustNotesProps) {
  // Get notes from Zustand store
  const { isLoading, animating, newNoteId, isReorderingInProgress, getFilteredNotes } =
    useNotesStore();

  // Use filtered notes (respects notebook selection, search, etc.)
  const notes = getFilteredNotes();

  const {
    addNote,
    updatePinStatus,
    updatePrivacyStatus,
    updateCollapsedStatus,
    reorderNote,
    transferNote,
    syncAndRenumberNotes,
    deleteNote,
    saveNoteContent,
    saveNoteTitle,
    transferringNoteId,
  } = notesOperations;

  // Template selection state
  const [showTemplates, setShowTemplates] = useState(false);

  // Handle template selection
  const handleSelectTemplate = useCallback((content: string, title: string) => {
    addNote(content, title);
    setShowTemplates(false);
  }, [addNote]);

  // Handle adding blank note
  const handleAddBlankNote = useCallback(() => {
    addNote();
  }, [addNote]);

  // Memoize button text to prevent re-renders
  const addButtonText = useMemo(
    () => `Add a new ${isAuthenticated ? "cloud" : "local"} note`,
    [isAuthenticated],
  );

  // Memoize sync button disabled state
  const isSyncDisabled = useMemo(
    () => isReorderingInProgress,
    [isReorderingInProgress],
  );

  // Memoize add button disabled state
  const isAddDisabled = useMemo(() => animating, [animating]);

  // Calculate position info
  const getNotePositionInfo = useCallback(
    (noteId: string) => {
      const pinnedNotes = notes.filter((note) => note.isPinned);
      const unpinnedNotes = notes.filter((note) => !note.isPinned);

      const pinnedIndex = pinnedNotes.findIndex((note) => note.id === noteId);
      const unpinnedIndex = unpinnedNotes.findIndex(
        (note) => note.id === noteId,
      );

      return {
        isFirstPinned: pinnedIndex === 0,
        isLastPinned: pinnedIndex === pinnedNotes.length - 1,
        isFirstUnpinned: unpinnedIndex === 0,
        isLastUnpinned: unpinnedIndex === unpinnedNotes.length - 1,
      };
    },
    [notes],
  );

  // Simplified callback for opening distraction-free mode
  const handleOpenDistractionFree = useCallback(
    (note: CombinedNote) => {
      if (!openDistractionFreeNote) return;
      openDistractionFreeNote(note);
    },
    [openDistractionFreeNote],
  );

  // Simplified callback for opening split view mode
  const handleOpenSplitView = useCallback(
    (note: CombinedNote) => {
      if (!openSplitViewNote) return;
      openSplitViewNote(note);
    },
    [openSplitViewNote],
  );

  const handleSyncAndRenumber = useCallback(() => {
    syncAndRenumberNotes();
  }, [syncAndRenumberNotes]);

  const handleReorder = useCallback(
    (noteId: string, direction: "up" | "down") => {
      reorderNote(noteId, direction);
    },
    [reorderNote],
  );

  const handleTransfer = useCallback(
    (noteId: string, targetSource: NoteSource) => {
      transferNote(noteId, targetSource);
    },
    [transferNote],
  );

  if (isLoading) {
    return (
      <div className="col-span-12 text-center py-10">
        <div className="inline-flex items-center gap-2">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-mercedes-primary"></div>
          Loading your notes...
        </div>
      </div>
    );
  }

  return (
    <main className="relative grid grid-cols-12 gap-3">
      <section className="px-3 col-span-12 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncAndRenumber}
            disabled={isSyncDisabled}
            className={`px-3 py-2 cursor-pointer inline-flex items-center gap-2 rounded-lg bg-white border border-neutral-200 text-neutral-600 hover:border-mercedes-primary/40 hover:text-mercedes-primary hover:shadow-sm transition-all duration-300 ease-in-out ${
              isSyncDisabled ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <IconRefresh size={24} strokeWidth={1.5} />
            <span className="hidden md:flex">Sync Notes</span>
          </button>

          {isReorderingInProgress && (
            <>
              <span className="hidden md:flex text-sm text-neutral-500 italic animate-pulse">
                Syncing and renumbering...
              </span>
              <span className="flex md:hidden text-sm text-neutral-500 italic animate-pulse">
                Syncing...
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTemplates(true)}
            disabled={isAddDisabled}
            className={`px-3 py-2 cursor-pointer inline-flex items-center gap-2 rounded-lg bg-white border border-neutral-200 text-neutral-600 hover:border-mercedes-primary/40 hover:text-mercedes-primary hover:shadow-sm transition-all duration-300 ease-in-out ${
              isAddDisabled ? "opacity-50 cursor-not-allowed" : ""
            }`}
            title="Create note from template"
          >
            <IconTemplate size={24} strokeWidth={1.5} />
            <span className="hidden lg:flex">From Template</span>
          </button>

          <button
            type="button"
            onClick={handleAddBlankNote}
            disabled={isAddDisabled}
            className={`px-3 py-2 cursor-pointer inline-flex items-center gap-2 rounded-lg bg-mercedes-primary/10 border border-mercedes-primary/20 text-mercedes-primary hover:bg-mercedes-primary hover:text-white transition-all duration-300 ease-in-out ${
              isAddDisabled ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <IconSquareRoundedPlus size={30} strokeWidth={1.5} />
            <span className="hidden md:flex">{addButtonText}</span>
          </button>
        </div>
      </section>

      <div className="col-span-12 grid grid-cols-12 gap-4 note-container">
        {notes.map((note) => {
          const positionInfo = getNotePositionInfo(note.id);
          const noteKey = `${note.source}-${note.id}`;
          const isNew = note.id === newNoteId;

          return (
            <MemoizedNoteWrapper
              key={noteKey}
              note={note}
              positionInfo={positionInfo}
              isNew={isNew}
              userId={userId || ""}
              showDelete={notes.length > 1}
              isAuthenticated={isAuthenticated}
              transferringNoteId={transferringNoteId}
              onDelete={deleteNote}
              onPinStatusChange={updatePinStatus}
              onPrivacyStatusChange={updatePrivacyStatus}
              onCollapsedStatusChange={updateCollapsedStatus}
              onReorder={handleReorder}
              onTransferNote={handleTransfer}
              onRegisterFlush={registerNoteFlush}
              onUnregisterFlush={unregisterNoteFlush}
              onOpenDistractionFree={handleOpenDistractionFree}
              onOpenSplitView={handleOpenSplitView}
              saveNoteContent={saveNoteContent}
              saveNoteTitle={saveNoteTitle}
            />
          );
        })}
      </div>

      {/* Template selection modal */}
      {showTemplates && (
        <NoteTemplates
          onSelectTemplate={handleSelectTemplate}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </main>
  );
}

interface NotePositionInfo {
  isFirstPinned: boolean;
  isLastPinned: boolean;
  isFirstUnpinned: boolean;
  isLastUnpinned: boolean;
}

interface MemoizedNoteWrapperProps {
  note: CombinedNote;
  positionInfo: NotePositionInfo;
  isNew: boolean;
  onOpenDistractionFree: (note: CombinedNote) => void;
  onOpenSplitView: (note: CombinedNote) => void;
  saveNoteContent: (
    noteId: string,
    content: string,
    goal: number,
    goalType: "" | "words" | "characters",
  ) => Promise<{ success: boolean }>;
  saveNoteTitle: (noteId: string, title: string) => Promise<{ success: boolean }>;
  userId: string;
  showDelete: boolean;
  isAuthenticated: boolean;
  transferringNoteId: string | null;
  onDelete: (noteId: string) => void;
  onPinStatusChange: (noteId: string, isPinned: boolean) => void;
  onPrivacyStatusChange: (noteId: string, isPrivate: boolean) => void;
  onCollapsedStatusChange: (noteId: string, isCollapsed: boolean) => void;
  onReorder: (noteId: string, direction: "up" | "down") => void;
  onTransferNote: (noteId: string, targetSource: NoteSource) => void;
  onRegisterFlush: (noteId: string, flushFn: () => void) => void;
  onUnregisterFlush: (noteId: string) => void;
}

const MemoizedNoteWrapper = React.memo(function NoteWrapper({
  note,
  positionInfo,
  isNew,
  onOpenDistractionFree,
  onOpenSplitView,
  saveNoteContent,
  saveNoteTitle,
  userId,
  showDelete,
  isAuthenticated,
  transferringNoteId,
  onDelete,
  onPinStatusChange,
  onPrivacyStatusChange,
  onCollapsedStatusChange,
  onReorder,
  onTransferNote,
  onRegisterFlush,
  onUnregisterFlush,
}: MemoizedNoteWrapperProps) {
  const handleOpenDistractionFree = useCallback(() => {
    onOpenDistractionFree(note);
  }, [note, onOpenDistractionFree]);

  const handleOpenSplitView = useCallback(() => {
    onOpenSplitView(note);
  }, [note, onOpenSplitView]);

  return (
    <div
      data-note-id={note.id}
      className={`col-span-12 ${isNew ? "animate-slide-in" : ""}`}
    >
      <NoteBlock
        details={{
          ...note,
          isPinned: note.isPinned,
          isPrivate: note.isPrivate,
          isCollapsed: note.isCollapsed,
          goal: note.goal,
          goal_type:
            note.goal_type === "words" || note.goal_type === "characters"
              ? note.goal_type
              : ("" as "" | "words" | "characters"),
        }}
        {...positionInfo}
        userId={userId}
        showDelete={showDelete}
        isAuthenticated={isAuthenticated}
        noteSource={note.source}
        isTransferring={transferringNoteId === note.id}
        onDelete={onDelete}
        onPinStatusChange={onPinStatusChange}
        onPrivacyStatusChange={onPrivacyStatusChange}
        onCollapsedStatusChange={onCollapsedStatusChange}
        onReorder={onReorder}
        onTransferNote={onTransferNote}
        onRegisterFlush={onRegisterFlush}
        onUnregisterFlush={onUnregisterFlush}
        openDistractionFreeNote={handleOpenDistractionFree}
        openSplitViewNote={handleOpenSplitView}
        saveNoteContent={saveNoteContent}
        saveNoteTitle={saveNoteTitle}
      />
    </div>
  );
});
