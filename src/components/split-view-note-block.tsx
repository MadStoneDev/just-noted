"use client";

import React, { useState, useMemo, useCallback } from "react";
import DOMPurify from "dompurify";
import { useNotesStore } from "@/stores/notes-store";
import NoteBlock from "@/components/note-block";
import ReferenceNoteSelector from "@/components/reference-note-selector";
import LazyTextBlock from "@/components/lazy-text-block";
import { CombinedNote } from "@/types/combined-notes";
import {
  IconLayoutColumns,
  IconLayoutRows,
  IconLock,
  IconLockOpen,
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
      goalType: "" | "words" | "characters"
    ) => Promise<{ success: boolean }>;
    saveNoteTitle: (noteId: string, title: string) => Promise<{ success: boolean }>;
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

  // Get the reference note
  const referenceNote = useMemo(
    () => notes.find((n) => n.id === referenceNoteId),
    [notes, referenceNoteId]
  );

  // Local content state for editable mode
  const [localContent, setLocalContent] = useState(referenceNote?.content || "");

  // Update local content when reference note changes
  React.useEffect(() => {
    if (referenceNote) {
      setLocalContent(referenceNote.content);
    }
  }, [referenceNote?.id, referenceNote?.content]);

  const handleNoteSelect = useCallback(
    (noteId: string) => {
      setReferenceNoteId(noteId);
    },
    [setReferenceNoteId]
  );

  const handleContentChange = useCallback(
    (content: string) => {
      setLocalContent(content);
      if (referenceNoteId) {
        optimisticUpdateNote(referenceNoteId, { content });
      }
    },
    [referenceNoteId, optimisticUpdateNote]
  );

  const isHorizontal = splitViewDirection === "horizontal";

  if (!note) return null;

  return (
    <div className={`flex ${isHorizontal ? "flex-row" : "flex-col"} h-full gap-2`}>
      {/* Main note pane */}
      <div className={`${isHorizontal ? "w-1/2" : "h-1/2"} overflow-auto`}>
        <NoteBlock
          details={note}
          userId={userId}
          noteSource={note.source}
          isAuthenticated={isAuthenticated}
          distractionFreeMode={true}
          onRegisterFlush={registerNoteFlush}
          onUnregisterFlush={unregisterNoteFlush}
          saveNoteContent={notesOperations.saveNoteContent}
          saveNoteTitle={notesOperations.saveNoteTitle}
        />
      </div>

      {/* Divider */}
      <div
        className={`${
          isHorizontal ? "w-1" : "h-1"
        } bg-neutral-400 rounded-full flex-shrink-0`}
      />

      {/* Reference note pane */}
      <div className={`${isHorizontal ? "w-1/2" : "h-1/2"} flex flex-col overflow-hidden bg-white rounded-xl`}>
        {/* Reference header */}
        <div className="flex items-center justify-between px-3 py-2 bg-neutral-100 border-b border-neutral-200 flex-shrink-0">
          <ReferenceNoteSelector
            onSelect={handleNoteSelect}
            selectedNoteId={referenceNoteId}
            excludeNoteId={note.id}
          />

          <div className="flex items-center gap-1">
            {/* Layout toggle */}
            <button
              onClick={() =>
                setSplitViewDirection(isHorizontal ? "vertical" : "horizontal")
              }
              className="p-1.5 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200 rounded transition-colors"
              title={isHorizontal ? "Switch to vertical" : "Switch to horizontal"}
            >
              {isHorizontal ? (
                <IconLayoutRows size={16} />
              ) : (
                <IconLayoutColumns size={16} />
              )}
            </button>

            {/* Editable toggle */}
            <button
              onClick={() => setReferenceNoteEditable(!referenceNoteEditable)}
              className={`p-1.5 rounded transition-colors ${
                referenceNoteEditable
                  ? "bg-mercedes-primary/10 text-mercedes-primary"
                  : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200"
              }`}
              title={referenceNoteEditable ? "Lock (read-only)" : "Unlock (editable)"}
            >
              {referenceNoteEditable ? (
                <IconLockOpen size={16} />
              ) : (
                <IconLock size={16} />
              )}
            </button>
          </div>
        </div>

        {/* Reference content */}
        <div className="flex-1 overflow-auto">
          {referenceNote ? (
            <div className="h-full">
              {/* Title */}
              <div className="px-4 py-2 border-b border-neutral-200">
                <h3 className="font-medium text-neutral-800 truncate">
                  {referenceNote.title}
                </h3>
              </div>

              {/* Content */}
              <div className="p-2 h-[calc(100%-50px)]">
                {referenceNoteEditable ? (
                  <LazyTextBlock
                    noteId={referenceNote.id}
                    value={localContent}
                    onChange={handleContentChange}
                    className="h-full"
                    placeholder="Reference note content..."
                  />
                ) : (
                  <div
                    className="prose prose-sm max-w-none p-4 h-full overflow-auto"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(referenceNote.content) }}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center text-neutral-500">
              <p className="text-sm">Select a note to reference</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
