"use client";

import React, { useEffect, useState } from "react";
import { useNotes } from "./hooks/use-notes";
import NoteBlock from "@/components/note-block";
import { IconSquareRoundedPlus } from "@tabler/icons-react";
import { CollapseAllButton } from "@/components/collapse-all-button";
import { NoteVisibilityControls } from "@/components/note-visibility-controls";

export default function JustNotes() {
  // Use our custom hook for all note functionality
  const {
    notes,
    isLoading,
    animating,
    newNoteId,
    userId,
    authUserId,
    isAuthenticated,
    addNote,
    updatePinStatus,
    updatePrivacyStatus,
    updateCollapsedStatus,
    reorderNote,
    deleteNote,
    handleNoteTransfer,
    getNotePositionInfo,
    refreshNotes,
  } = useNotes();

  const [isTransferring, setIsTransferring] = useState<string | null>(null);
  const [allNotesCollapsed, setAllNotesCollapsed] = useState(false);
  const [collapsedNoteIds, setCollapsedNoteIds] = useState<Set<string>>(
    new Set(),
  );

  // Handler for transferring notes from Redis to Supabase
  const handleTransfer = async (noteId: string) => {
    if (!authUserId || !isAuthenticated) return;

    setIsTransferring(noteId);
    await handleNoteTransfer(noteId);
    setIsTransferring(null);
  };

  // Functions
  const handleCollapseAll = () => {
    // Collapse all: Add all note IDs to collapsedNoteIds
    setCollapsedNoteIds(new Set(notes.map((note) => note.id)));
  };

  // Handle expanding all notes
  const handleExpandAll = () => {
    // Expand all: Clear collapsedNoteIds
    setCollapsedNoteIds(new Set());
  };

  // Handle individual note collapse/expand
  const handleNoteCollapse = (noteId: string, isCollapsed: boolean) => {
    // First, update in the database as you were doing before
    if (updateCollapsedStatus) {
      updateCollapsedStatus(noteId, isCollapsed);
    }

    // Then, update our UI-only state
    const newCollapsedIds = new Set(collapsedNoteIds);
    if (isCollapsed) {
      newCollapsedIds.add(noteId);
    } else {
      newCollapsedIds.delete(noteId);
    }
    setCollapsedNoteIds(newCollapsedIds);
  };

  const hasCollapsedNotes = collapsedNoteIds.size > 0;
  const hasExpandedNotes = notes.length > collapsedNoteIds.size;

  // Effects
  useEffect(() => {
    // Initialize with notes that have isCollapsed=true
    const initialCollapsedIds = new Set(
      notes.filter((note) => note.isCollapsed).map((note) => note.id),
    );
    setCollapsedNoteIds(initialCollapsedIds);
  }, [notes]);

  if (isLoading) {
    return (
      <div className="col-span-12 text-center py-10">
        <div className="animate-pulse">Loading your notes...</div>
      </div>
    );
  }

  return (
    <main className={`grid grid-cols-12 gap-3`}>
      <section className={`col-span-12 flex items-center justify-end`}>
        {/*<div className="flex space-x-2">*/}
        {/*  /!* Refresh button *!/*/}
        {/*  <button*/}
        {/*    type="button"*/}
        {/*    onClick={refreshNotes}*/}
        {/*    className="px-2 py-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-mercedes-primary hover:bg-mercedes-lighter transition-all duration-300 ease-in-out"*/}
        {/*  >*/}
        {/*    <span>Refresh</span>*/}
        {/*  </button>*/}

        {/*  /!* Note visibility controls - only show when there are notes *!/*/}
        {/*  {notes.length > 0 && (*/}
        {/*    <NoteVisibilityControls*/}
        {/*      hasCollapsedNotes={hasCollapsedNotes}*/}
        {/*      hasExpandedNotes={hasExpandedNotes}*/}
        {/*      onCollapseAll={handleCollapseAll}*/}
        {/*      onExpandAll={handleExpandAll}*/}
        {/*    />*/}
        {/*  )}*/}
        {/*</div>*/}

        {/* Add note button - existing code */}
        <button
          type="button"
          onClick={addNote}
          disabled={animating}
          className={`px-2 py-1 cursor-pointer inline-flex items-center gap-2 rounded-xl border border-neutral-400 hover:border-mercedes-primary hover:bg-mercedes-primary transition-all duration-300 ease-in-out ${
            animating ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <IconSquareRoundedPlus size={30} strokeWidth={1.5} />
          <span>Add a new note</span>
        </button>
      </section>

      <div className="col-span-12 grid grid-cols-12 gap-4 note-container">
        {/* Existing empty state handling */}
        {notes.length === 0 ? (
          <div className="col-span-12 text-center py-10">
            <p>
              You don't have any notes yet. Click 'Add a new note' to get
              started!
            </p>
          </div>
        ) : (
          notes.map((note, index) => {
            const {
              isFirstPinned,
              isLastPinned,
              isFirstUnpinned,
              isLastUnpinned,
            } = getNotePositionInfo(note.id, note.pinned || false);

            // Check if note can be transferred
            const canTransfer = Boolean(
              isAuthenticated && authUserId && note.storageType === "redis",
            );

            // Override the note's collapsed state with our UI state
            const isNoteCollapsed = collapsedNoteIds.has(note.id);

            // Render the note with the UI collapsed state
            return (
              <div
                key={note.id}
                className={`col-span-12 ${
                  note.id === newNoteId
                    ? "animate-slide-in"
                    : animating && index > 0
                      ? "animate-shift-down"
                      : ""
                }`}
              >
                <NoteBlock
                  details={{ ...note, isCollapsed: isNoteCollapsed }}
                  userId={userId || ""}
                  showDelete={notes.length > 1}
                  onDelete={deleteNote}
                  onPinStatusChange={updatePinStatus}
                  onPrivacyStatusChange={updatePrivacyStatus}
                  onCollapsedStatusChange={(noteId, isCollapsed) =>
                    handleNoteCollapse(noteId, isCollapsed)
                  }
                  onReorder={reorderNote}
                  isFirstPinned={isFirstPinned}
                  isLastPinned={isLastPinned}
                  isFirstUnpinned={isFirstUnpinned}
                  isLastUnpinned={isLastUnpinned}
                  storageType={note.storageType}
                  canTransfer={canTransfer}
                  isTransferring={isTransferring === note.id}
                  onTransfer={canTransfer ? handleTransfer : undefined}
                  isAuthenticated={isAuthenticated}
                  authUserId={authUserId}
                />
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
