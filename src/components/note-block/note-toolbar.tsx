import React from "react";
import ExportButton from "./sub-components/export-button";
import TransferButton from "./sub-components/transfer-button";
import SaveButton from "./sub-components/save-button";
import DeleteButton from "@/components/delete-button";
import ShareNoteButton from "@/components/share-note-button";
import type { NoteSource } from "@/types/combined-notes";

interface NoteToolbarProps {
  noteId: string;
  userId: string;
  noteTitle: string;
  noteSource: NoteSource;
  isPrivate: boolean;
  isPinned: boolean;
  isPending: boolean;
  isAuthenticated: boolean;
  showDelete: boolean;
  onExport: () => void;
  onTransfer?: (targetSource: NoteSource) => void;
  onManualSave: () => void;
  onDelete?: (noteId: string) => void;
}

/**
 * Note toolbar component
 * Contains action buttons: export, transfer, share, save, delete
 */
export default function NoteToolbar({
  noteId,
  userId,
  noteTitle,
  noteSource,
  isPrivate,
  isPinned,
  isPending,
  isAuthenticated,
  showDelete,
  onExport,
  onTransfer,
  onManualSave,
  onDelete,
}: NoteToolbarProps) {
  return (
    <article
      className={`mt-3 flex gap-2 items-center justify-between sm:justify-start`}
    >
      {/* Export button */}
      <ExportButton onClick={onExport} isPrivate={isPrivate} />

      {/* Authenticated user actions */}
      {isAuthenticated && (
        <>
          {/* Transfer button */}
          {onTransfer && (
            <TransferButton
              noteSource={noteSource}
              onTransfer={onTransfer}
              isPrivate={isPrivate}
            />
          )}

          {/* Share button */}
          <ShareNoteButton
            noteId={noteId}
            noteTitle={noteTitle}
            noteSource={noteSource}
            isPrivate={isPrivate}
            isAuthenticated={isAuthenticated}
            userId={userId}
          />
        </>
      )}

      {/* Divider */}
      <div
        className={`hidden sm:block flex-grow h-0.5 ${
          isPrivate
            ? "bg-violet-800"
            : isPinned
              ? "bg-mercedes-primary"
              : "bg-neutral-300"
        } transition-all duration-300 ease-in-out`}
      ></div>

      {/* Manual save button */}
      <SaveButton
        onClick={onManualSave}
        isPending={isPending}
        isPrivate={isPrivate}
      />

      {/* Delete button */}
      {showDelete && (
        <DeleteButton
          noteId={noteId}
          noteTitle={noteTitle}
          userId={userId}
          noteSource={noteSource}
          onDeleteSuccess={onDelete}
        />
      )}
    </article>
  );
}
