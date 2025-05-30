﻿"use client";

import React from "react";
import { useCombinedNotes } from "./hooks/use-combined-notes";
import NoteBlock from "@/components/note-block";

import { IconSquareRoundedPlus, IconRefresh } from "@tabler/icons-react";

export default function JustNotes() {
  // Use our combined notes hook
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
  } = useCombinedNotes();

  if (isLoading) {
    return (
      <div className="col-span-12 text-center py-10">Loading your notes...</div>
    );
  }

  return (
    <main className={`relative grid grid-cols-12 gap-3`}>
      <section className={`px-3 col-span-12 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <button
            type={`button`}
            onClick={syncAndRenumberNotes}
            disabled={isReorderingInProgress}
            className={`px-2 py-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-blue-500 hover:bg-blue-500 hover:text-white transition-all duration-300 ease-in-out ${
              isReorderingInProgress ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <IconRefresh size={24} strokeWidth={1.5} />
            <span className={`hidden md:flex`}>Sync Notes</span>
          </button>
          {isReorderingInProgress && (
            <>
              <span
                className={`hidden md:flex text-sm text-neutral-500 italic animate-pulse`}
              >
                Syncing and renumbering...
              </span>

              <span
                className={`flex md:hidden text-sm text-neutral-500 italic animate-pulse`}
              >
                Syncing...
              </span>
            </>
          )}
        </div>

        <button
          type={`button`}
          onClick={addNote}
          disabled={animating}
          className={`px-2 py-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-mercedes-primary hover:bg-mercedes-primary hover:text-white transition-all duration-300 ease-in-out ${
            animating ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <IconSquareRoundedPlus size={30} strokeWidth={1.5} />
          <span className={`hidden md:flex`}>
            Add a new {isAuthenticated ? "cloud" : "local"} note
          </span>
        </button>
      </section>

      <div className="col-span-12 grid grid-cols-12 gap-4 note-container">
        {notes.map((note, index) => {
          // Get position information for each note
          const {
            isFirstPinned,
            isLastPinned,
            isFirstUnpinned,
            isLastUnpinned,
          } = getNotePositionInfo(note.id, note.isPinned || false);

          return (
            <div
              key={`${note.source}-${note.id}`}
              className={`col-span-12 ${
                note.id === newNoteId
                  ? "animate-slide-in"
                  : animating && index > 0
                    ? "animate-shift-down"
                    : ""
              }`}
            >
              <NoteBlock
                details={{
                  ...note,
                  // Map the CombinedNote properties to what NoteBlock expects
                  isPinned: note.isPinned,
                  isPrivate: note.isPrivate,
                  isCollapsed: note.isCollapsed,
                  goal: note.goal,
                  goal_type:
                    note.goal_type === "words" ||
                    note.goal_type === "characters"
                      ? note.goal_type
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
                noteSource={note.source}
                onTransferNote={transferNote}
                isTransferring={transferringNoteId === note.id}
                isAuthenticated={isAuthenticated}
                onRegisterFlush={registerNoteFlush}
                onUnregisterFlush={unregisterNoteFlush}
              />
            </div>
          );
        })}
      </div>
    </main>
  );
}
