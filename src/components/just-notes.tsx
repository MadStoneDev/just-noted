"use client";

import React, { useState, useCallback, useMemo } from "react";

import NoteBlock from "@/components/note-block";
import { CombinedNote } from "@/types/combined-notes";
import { useCombinedNotes } from "@/hooks/use-combined-notes";

import { IconSquareRoundedPlus, IconRefresh } from "@tabler/icons-react";

export default function JustNotes({
  openDistractionFreeNote,
}: {
  openDistractionFreeNote?: (
    note: CombinedNote,
    onRefresh: () => Promise<void>,
  ) => void;
}) {
  const {
    notes,
    isLoading,
    animating,
    newNoteId,
    userId,
    isAuthenticated,
    isReorderingInProgress,
    transferringNoteId,
    addNote,
    updatePinStatus,
    updatePrivacyStatus,
    updateCollapsedStatus,
    reorderNote,
    deleteNote,
    getNotePositionInfo,
    transferNote,
    syncAndRenumberNotes,
    registerNoteFlush,
    unregisterNoteFlush,
    refreshNotes,
  } = useCombinedNotes();

  const [refreshNoteId, setRefreshNoteId] = useState<string | null>(null);

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

  // Stable callback for opening distraction-free mode
  const handleOpenDistractionFree = useCallback(
    (note: CombinedNote) => {
      if (!openDistractionFreeNote) return;

      const refreshCallback = async () => {
        await refreshNotes();
        setRefreshNoteId(note.id);
        setTimeout(() => setRefreshNoteId(null), 1000);
      };

      openDistractionFreeNote(note, refreshCallback);
    },
    [openDistractionFreeNote, refreshNotes],
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
            onClick={syncAndRenumberNotes}
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
          const noteKey = `${note.source}-${note.id}${
            refreshNoteId === note.id ? "-refreshed" : ""
          }`;

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
              onReorder={reorderNote}
              onTransferNote={transferNote}
              onRegisterFlush={registerNoteFlush}
              onUnregisterFlush={unregisterNoteFlush}
              onOpenDistractionFree={handleOpenDistractionFree}
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
  ...props
}: {
  note: CombinedNote;
  positionInfo: any;
  isNew: boolean;
  onOpenDistractionFree: (note: CombinedNote) => void;
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
      />
    </div>
  );
});
