import React from "react";
import { IconHistory } from "@tabler/icons-react";
import ExportMenu from "@/components/ui/export-menu";
import TransferButton from "./sub-components/transfer-button";
import SaveButton from "./sub-components/save-button";
import DeleteButton from "@/components/delete-button";
import ShareNoteButton from "@/components/share-note-button";
import AIAnalysisButton from "@/components/ui/ai-analysis";
import type { NoteSource, CombinedNote } from "@/types/combined-notes";

interface NoteToolbarProps {
  noteId: string;
  userId: string;
  noteTitle: string;
  noteSource: NoteSource;
  note: CombinedNote;
  isPrivate: boolean;
  isPinned: boolean;
  isPending: boolean;
  isAuthenticated: boolean;
  showDelete: boolean;
  onTransfer?: (targetSource: NoteSource) => void;
  onManualSave: () => void;
  onDelete?: (noteId: string) => void;
  onShowVersionHistory?: () => void;
  onReplaceContent?: (content: string) => void;
}

/**
 * Note toolbar component
 * Contains action buttons: export, transfer, share, save, delete, version history
 */
export default function NoteToolbar({
  noteId,
  userId,
  noteTitle,
  noteSource,
  note,
  isPrivate,
  isPinned,
  isPending,
  isAuthenticated,
  showDelete,
  onTransfer,
  onManualSave,
  onDelete,
  onShowVersionHistory,
  onReplaceContent,
}: NoteToolbarProps) {
  return (
    <article
      className={`mt-3 flex gap-2 items-center justify-between sm:justify-start`}
    >
      {/* Export menu with multiple formats */}
      <ExportMenu note={note} />

      {/* Version History button */}
      {onShowVersionHistory && (
        <button
          type="button"
          onClick={onShowVersionHistory}
          title="View version history"
          className={`group/history px-2 cursor-pointer flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 w-fit min-w-10 h-10 rounded-lg border-1 ${
            isPrivate
              ? "border-violet-800 hover:bg-violet-800 hover:text-neutral-100"
              : "border-neutral-500 hover:border-mercedes-primary hover:bg-mercedes-primary"
          } text-neutral-800 overflow-hidden transition-all duration-300 ease-in-out`}
        >
          <IconHistory size={20} strokeWidth={2} />
          <span
            className={`w-fit max-w-0 sm:group-hover/history:max-w-52 opacity-0 md:group-hover/history:opacity-100 overflow-hidden transition-all duration-300 ease-in-out`}
          >
            History
          </span>
        </button>
      )}

      {/* AI Analysis button */}
      <AIAnalysisButton
        userId={isAuthenticated ? userId : null}
        note={note}
        isPrivate={isPrivate}
        onReplaceContent={onReplaceContent}
      />

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
