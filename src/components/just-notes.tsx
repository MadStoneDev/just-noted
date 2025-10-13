﻿"use client";

import React, { useCallback, useMemo } from "react";

import NoteBlock from "@/components/note-block";
import { CombinedNote, NoteSource } from "@/types/combined-notes";
import { useNotesStore } from "@/stores/notes-store";

import { IconSquareRoundedPlus, IconRefresh } from "@tabler/icons-react";

interface JustNotesProps {
  openDistractionFreeNote?: (note: CombinedNote) => void;
  userId: string | null;
  isAuthenticated: boolean;
  notesOperations: any;
  registerNoteFlush: (noteId: string, flushFn: () => void) => void;
  unregisterNoteFlush: (noteId: string) => void;
}

export default function JustNotes({
  openDistractionFreeNote,
  userId,
  isAuthenticated,
  notesOperations,
  registerNoteFlush,
  unregisterNoteFlush,
}: JustNotesProps) {
  // Get notes from Zustand store
  const { notes, isLoading, animating, newNoteId, isReorderingInProgress } =
    useNotesStore();

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
            className={`px-2 py-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-blue-500 hover:bg-blue-500 hover:text-white transition-all duration-300 ease-in-out ${
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

        <button
          type="button"
          onClick={addNote}
          disabled={isAddDisabled}
          className={`px-2 py-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-mercedes-primary hover:bg-mercedes-primary hover:text-white transition-all duration-300 ease-in-out ${
            isAddDisabled ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <IconSquareRoundedPlus size={30} strokeWidth={1.5} />
          <span className="hidden md:flex">{addButtonText}</span>
        </button>
      </section>

      <div className="col-span-12 grid grid-cols-12 gap-4 note-container">
        {notes.map((note) => {
          const positionInfo = getNotePositionInfo(note.id);
          const noteKey = `${note.source}-${note.id}`;

          return (
            <MemoizedNoteWrapper
              key={noteKey}
              note={note}
              positionInfo={positionInfo}
              isNew={note.id === newNoteId}
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
              saveNoteContent={saveNoteContent}
              saveNoteTitle={saveNoteTitle}
            />
          );
        })}
      </div>
    </main>
  );
}

const MemoizedNoteWrapper = React.memo(function NoteWrapper({
  note,
  positionInfo,
  isNew,
  onOpenDistractionFree,
  saveNoteContent,
  saveNoteTitle,
  ...props
}: {
  note: CombinedNote;
  positionInfo: any;
  isNew: boolean;
  onOpenDistractionFree: (note: CombinedNote) => void;
  saveNoteContent: any;
  saveNoteTitle: any;
  [key: string]: any;
}) {
  const handleOpenDistractionFree = useCallback(() => {
    onOpenDistractionFree(note);
  }, [note, onOpenDistractionFree]);

  return (
    <div className={`col-span-12 ${isNew ? "animate-slide-in" : ""}`}>
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
        {...props}
        noteSource={note.source}
        isTransferring={props.transferringNoteId === note.id}
        openDistractionFreeNote={handleOpenDistractionFree}
        saveNoteContent={saveNoteContent}
        saveNoteTitle={saveNoteTitle}
      />
    </div>
  );
});
