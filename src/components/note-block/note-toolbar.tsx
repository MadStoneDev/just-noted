import React, { useCallback } from "react";
import { IconHistory, IconPrinter } from "@tabler/icons-react";
import ExportMenu from "@/components/ui/export-menu";
import TransferButton from "./sub-components/transfer-button";
import MoveToNotebookButton from "./sub-components/move-to-notebook-button";
import SaveButton from "./sub-components/save-button";
import DeleteButton from "@/components/delete-button";
import ShareNoteButton from "@/components/share-note-button";
// import AIAnalysisButton from "@/components/ui/ai-analysis"; // Temporarily disabled
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
  const handlePrint = useCallback(() => {
    const printWindow = window.open("", "_blank", "width=800,height=600");
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${note.title} — JustNoted</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Outfit', system-ui, -apple-system, sans-serif;
      max-width: 700px;
      margin: 0 auto;
      padding: 2.5rem 2rem;
      color: #44403c;
      line-height: 1.7;
      font-size: 14px;
    }
    h1.note-title {
      font-size: 1.5rem;
      font-weight: 600;
      color: #004146;
      margin-bottom: 0.25rem;
    }
    .note-meta {
      font-size: 0.75rem;
      color: #a8a29e;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e7e5e4;
    }
    .note-body h1 { font-size: 1.4rem; font-weight: 600; margin: 1.25rem 0 0.5rem; color: #1c1917; }
    .note-body h2 { font-size: 1.2rem; font-weight: 600; margin: 1.1rem 0 0.4rem; color: #1c1917; }
    .note-body h3 { font-size: 1.05rem; font-weight: 600; margin: 1rem 0 0.35rem; color: #1c1917; }
    .note-body p { margin: 0.5rem 0; }
    .note-body ul, .note-body ol { padding-left: 1.5rem; margin: 0.5rem 0; }
    .note-body li { margin: 0.2rem 0; }
    .note-body blockquote {
      border-left: 3px solid #03BFB5;
      padding: 0.5rem 1rem;
      margin: 0.75rem 0;
      color: #78716c;
      background: #fafaf9;
      border-radius: 0 0.25rem 0.25rem 0;
    }
    .note-body code {
      background: #f5f5f4;
      padding: 0.1rem 0.35rem;
      border-radius: 0.2rem;
      font-size: 0.9em;
    }
    .note-body pre {
      background: #1c1917;
      color: #e7e5e4;
      padding: 1rem;
      border-radius: 0.375rem;
      overflow-x: auto;
      margin: 0.75rem 0;
      font-size: 0.85em;
    }
    .note-body pre code { background: none; padding: 0; color: inherit; }
    .note-body a { color: #03BFB5; text-decoration: underline; }
    .note-body img { max-width: 100%; height: auto; border-radius: 0.375rem; margin: 0.75rem 0; }
    .note-body mark { background: #fef08a; padding: 0.05rem 0.2rem; border-radius: 0.15rem; }
    .note-body hr { border: none; border-top: 1px solid #e7e5e4; margin: 1.25rem 0; }
    .note-body ul[data-type="taskList"] { list-style: none; padding-left: 0; }
    .note-body ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.4rem; }
    @media print {
      body { padding: 0; }
      @page { margin: 2cm; }
    }
  </style>
</head>
<body>
  <h1 class="note-title">${note.title}</h1>
  <div class="note-meta">
    ${note.updatedAt ? new Date(note.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
  </div>
  <div class="note-body">${note.content}</div>
  <script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; }<\/script>
</body>
</html>`);
    printWindow.document.close();
  }, [note]);

  return (
    <article
      className={`mt-3 flex gap-2 items-center justify-between sm:justify-start`}
    >
      {/* Export menu with multiple formats */}
      <ExportMenu note={note} />

      {/* Print button */}
      <button
        type="button"
        onClick={handlePrint}
        title="Print note"
        aria-label="Print note"
        className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-neutral-100 transition-colors text-neutral-600"
      >
        <IconPrinter size={18} />
      </button>

      {/* Version History button */}
      {onShowVersionHistory && (
        <button
          type="button"
          onClick={onShowVersionHistory}
          title="View version history"
          aria-label="View version history"
          className={`group/history px-2 cursor-pointer flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 w-fit min-w-[44px] h-[44px] rounded-lg border-1 ${
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

      {/* AI Analysis button - temporarily disabled */}
      {/* <AIAnalysisButton
        userId={isAuthenticated ? userId : null}
        note={note}
        isPrivate={isPrivate}
        onReplaceContent={onReplaceContent}
      /> */}

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

          {/* Move to Notebook button (cloud notes only) */}
          {noteSource === "supabase" && (
            <MoveToNotebookButton
              noteId={noteId}
              currentNotebookId={note.notebookId}
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
        className={`hidden sm:block flex-grow h-px ${
          isPrivate
            ? "bg-violet-300/50"
            : isPinned
              ? "bg-mercedes-primary/30"
              : "bg-neutral-200/60"
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
