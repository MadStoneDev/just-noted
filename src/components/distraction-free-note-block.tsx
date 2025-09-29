"use client";

import React, { useMemo } from "react";
import NoteBlock from "@/components/note-block";
import { useCombinedNotes } from "./hooks/use-combined-notes";
import { CombinedNote } from "@/types/combined-notes";

export default function DistractionFreeNoteBlock({
  note,
  fullWidth,
}: {
  note?: CombinedNote | null;
  fullWidth?: boolean;
}) {
  // Use our combined notes hook
  const {
    notes,
    isLoading,
    userId,
    isAuthenticated,
    transferringNoteId,
    updatePinStatus,
    updatePrivacyStatus,
    updateCollapsedStatus,
    reorderNote,
    deleteNote,
    getNotePositionInfo,
    transferNote,
    registerNoteFlush,
    unregisterNoteFlush,
  } = useCombinedNotes();

  // Find the latest version of the note from the hook's state
  const latestNote = useMemo(() => {
    if (!note?.id) return note;

    // Try to find the note in the current notes state (most up-to-date)
    const foundNote = notes.find((n) => n.id === note.id);

    // If found in notes state, use that (it's more current)
    // Otherwise fall back to the passed note prop
    return foundNote || note;
  }, [notes, note?.id]);

  if (isLoading) {
    return (
      <div className="col-span-12 text-center py-10 h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-mercedes-primary"></div>
          <span>Loading your note...</span>
        </div>
      </div>
    );
  }

  if (!latestNote) {
    return (
      <div className="col-span-12 text-center py-10 h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <svg
            className="w-16 h-16"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span>Note not found</span>
        </div>
      </div>
    );
  }

  // Get position information for the note
  const { isFirstPinned, isLastPinned, isFirstUnpinned, isLastUnpinned } =
    getNotePositionInfo(latestNote.id, latestNote.isPinned || false);

  return (
    <div
      key={`${latestNote.source}-${latestNote.id}`}
      className={`mx-auto col-span-12 ${
        fullWidth ? "max-w-full" : "max-w-[750px]"
      } h-full transition-all duration-300 ease-in-out`}
    >
      <NoteBlock
        details={{
          ...latestNote,
          // Map the CombinedNote properties to what NoteBlock expects
          isPinned: latestNote.isPinned,
          isPrivate: latestNote.isPrivate,
          isCollapsed: latestNote.isCollapsed,
          goal: latestNote.goal,
          goal_type:
            latestNote.goal_type === "words" ||
            latestNote.goal_type === "characters"
              ? latestNote.goal_type
              : ("" as "" | "words" | "characters"),
        }}
        userId={userId || ""}
        showDelete={notes.length > 1}
        onDelete={deleteNote}
        onPinStatusChange={updatePinStatus}
        onPrivacyStatusChange={updatePrivacyStatus}
        onCollapsedStatusChange={updateCollapsedStatus}
        onReorder={reorderNote}
        isFirstPinned={isFirstPinned}
        isLastPinned={isLastPinned}
        isFirstUnpinned={isFirstUnpinned}
        isLastUnpinned={isLastUnpinned}
        noteSource={latestNote.source}
        onTransferNote={transferNote}
        isTransferring={transferringNoteId === latestNote.id}
        isAuthenticated={isAuthenticated}
        onRegisterFlush={registerNoteFlush}
        onUnregisterFlush={unregisterNoteFlush}
        distractionFreeMode={true}
      />
    </div>
  );
}
