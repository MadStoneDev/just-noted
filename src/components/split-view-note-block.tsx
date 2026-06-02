"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { sanitizeHtml } from "@/utils/sanitize";
import { marked } from "marked";
import LazyTextBlock from "@/components/lazy-text-block";
import { CombinedNote } from "@/types/combined-notes";
import { IconButton } from "@/components/ds/icon-button";
import {
  IconLayoutColumns,
  IconLayoutRows,
  IconLock,
  IconLockOpen,
  IconSelector,
} from "@tabler/icons-react";

interface SplitViewNoteBlockProps {
  note: CombinedNote | null;
  userId: string;
  isAuthenticated: boolean;
  notesOperations: {
    saveNoteContent: (
      noteId: string,
      content: string,
      goal: number,
      goalType: "" | "words" | "characters",
    ) => Promise<{ success: boolean }>;
    saveNoteTitle: (
      noteId: string,
      title: string,
    ) => Promise<{ success: boolean }>;
    [key: string]: any;
  };
  registerNoteFlush: (noteId: string, flushFn: () => void) => void;
  unregisterNoteFlush: (noteId: string) => void;
}

export default function SplitViewNoteBlock({
  note,
  userId,
  isAuthenticated,
  notesOperations,
  registerNoteFlush,
  unregisterNoteFlush,
}: SplitViewNoteBlockProps) {
  const {
    referenceNoteId,
    setReferenceNoteId,
    referenceNoteEditable,
    setReferenceNoteEditable,
    splitViewDirection,
    setSplitViewDirection,
    notes,
    optimisticUpdateNote,
  } = useNotesStore();

  const referenceNote = useMemo(
    () => notes.find((n) => n.id === referenceNoteId),
    [notes, referenceNoteId],
  );

  const otherNotes = useMemo(
    () => notes.filter((n) => n.id !== note?.id),
    [notes, note?.id],
  );

  const [localContent, setLocalContent] = useState(
    referenceNote?.content || "",
  );
  const [showNoteSelector, setShowNoteSelector] = useState(!referenceNoteId);

  React.useEffect(() => {
    if (referenceNote) {
      setLocalContent(referenceNote.content);
    }
  }, [referenceNote?.id, referenceNote?.content]);

  const handleNoteSelect = useCallback(
    (noteId: string) => {
      setReferenceNoteId(noteId);
      setShowNoteSelector(false);
    },
    [setReferenceNoteId],
  );

  const handleContentChange = useCallback(
    (content: string) => {
      setLocalContent(content);
      if (referenceNoteId) {
        optimisticUpdateNote(referenceNoteId, { content });
      }
    },
    [referenceNoteId, optimisticUpdateNote],
  );

  const isHorizontal = splitViewDirection === "horizontal";

  if (!note) return null;

  const renderContent = (refNote: CombinedNote) => {
    if (refNote.contentFormat === "markdown") {
      const html = marked.parse(refNote.content, { async: false }) as string;
      return sanitizeHtml(html);
    }
    return sanitizeHtml(refNote.content);
  };

  return (
    <div
      className={`flex ${isHorizontal ? "flex-row" : "flex-col"} h-full gap-px bg-[var(--color-border-secondary)]`}
    >
      {/* Main note — editor */}
      <div
        className={`${isHorizontal ? "w-1/2" : "h-1/2"} flex flex-col bg-[var(--color-bg-primary)] overflow-hidden`}
      >
        <div className="px-4 py-2 border-b border-[var(--color-border-secondary)]">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
            {note.title}
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-[var(--content-width)] mx-auto px-4 py-4">
            <LazyTextBlock
              noteId={note.id}
              value={note.content}
              contentFormat={note.contentFormat}
              onChange={(content) =>
                notesOperations.saveNoteContent(
                  note.id,
                  content,
                  note.goal || 0,
                  note.goal_type || "",
                )
              }
              distractionFreeMode
              placeholder="Start writing..."
            />
          </div>
        </div>
      </div>

      {/* Reference note pane */}
      <div
        className={`${isHorizontal ? "w-1/2" : "h-1/2"} flex flex-col bg-[var(--color-bg-primary)] overflow-hidden`}
      >
        {/* Reference toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
          <button
            onClick={() => setShowNoteSelector(true)}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] rounded-[var(--radius-md)] transition-colors duration-[var(--duration-fast)]"
          >
            <IconSelector size={12} />
            {referenceNote ? referenceNote.title : "Select a note"}
          </button>

          <div className="flex items-center">
            <IconButton
              label={isHorizontal ? "Stack vertically" : "Side by side"}
              size="sm"
              onClick={() =>
                setSplitViewDirection(
                  isHorizontal ? "vertical" : "horizontal",
                )
              }
            >
              {isHorizontal ? (
                <IconLayoutRows size={14} />
              ) : (
                <IconLayoutColumns size={14} />
              )}
            </IconButton>

            <IconButton
              label={
                referenceNoteEditable ? "Lock (read-only)" : "Unlock (edit)"
              }
              size="sm"
              onClick={() =>
                setReferenceNoteEditable(!referenceNoteEditable)
              }
            >
              {referenceNoteEditable ? (
                <IconLockOpen
                  size={14}
                  className="text-[var(--color-accent)]"
                />
              ) : (
                <IconLock size={14} />
              )}
            </IconButton>
          </div>
        </div>

        {/* Reference content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {showNoteSelector || !referenceNote ? (
            <div className="p-3">
              <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
                Choose a note to reference
              </p>
              <div className="flex flex-col gap-0.5">
                {otherNotes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleNoteSelect(n.id)}
                    className={`w-full text-left px-3 py-2 rounded-[var(--radius-md)] transition-colors duration-[var(--duration-fast)] ${
                      referenceNoteId === n.id
                        ? "bg-[var(--color-selected)]"
                        : "hover:bg-[var(--color-hover)]"
                    }`}
                  >
                    <p className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">
                      {n.title}
                    </p>
                  </button>
                ))}
                {otherNotes.length === 0 && (
                  <p className="text-xs text-[var(--color-text-tertiary)] text-center py-4">
                    No other notes available
                  </p>
                )}
              </div>
            </div>
          ) : referenceNoteEditable ? (
            <div className="max-w-[var(--content-width)] mx-auto px-4 py-4">
              <LazyTextBlock
                noteId={referenceNote.id}
                value={localContent}
                contentFormat={referenceNote.contentFormat}
                onChange={handleContentChange}
                distractionFreeMode
                placeholder="Reference note content..."
              />
            </div>
          ) : (
            <div className="max-w-[var(--content-width)] mx-auto px-4 py-4">
              <div
                className="milkdown text-sm"
                dangerouslySetInnerHTML={{
                  __html: renderContent(referenceNote),
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
