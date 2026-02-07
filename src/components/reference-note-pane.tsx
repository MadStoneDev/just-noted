"use client";

import React, { useState, useCallback, useMemo } from "react";
import { useNotesStore } from "@/stores/notes-store";
import { sanitizeHtml } from "@/utils/sanitize";
import ReferenceNoteSelector from "./reference-note-selector";
import LazyTextBlock from "./lazy-text-block";
import {
  IconLock,
  IconLockOpen,
  IconX,
  IconNotes,
} from "@tabler/icons-react";

interface ReferenceNotePaneProps {
  onClose: () => void;
}

export default function ReferenceNotePane({ onClose }: ReferenceNotePaneProps) {
  const {
    referenceNoteId,
    setReferenceNoteId,
    referenceNoteEditable,
    setReferenceNoteEditable,
    activeNoteId,
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

  const handleToggleEditable = useCallback(() => {
    setReferenceNoteEditable(!referenceNoteEditable);
  }, [referenceNoteEditable, setReferenceNoteEditable]);

  const handleContentChange = useCallback(
    (content: string) => {
      setLocalContent(content);
      // Optimistically update the note in the store
      if (referenceNoteId) {
        optimisticUpdateNote(referenceNoteId, { content });
      }
    },
    [referenceNoteId, optimisticUpdateNote]
  );

  return (
    <div className="flex flex-col h-full bg-neutral-50 border-l border-neutral-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-neutral-200">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <ReferenceNoteSelector
            onSelect={handleNoteSelect}
            selectedNoteId={referenceNoteId}
            excludeNoteId={activeNoteId || undefined}
          />
        </div>

        <div className="flex items-center gap-1">
          {/* Editable toggle */}
          <button
            onClick={handleToggleEditable}
            className={`p-1.5 rounded transition-colors ${
              referenceNoteEditable
                ? "bg-mercedes-primary/10 text-mercedes-primary"
                : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
            }`}
            title={referenceNoteEditable ? "Lock (read-only)" : "Unlock (editable)"}
          >
            {referenceNoteEditable ? (
              <IconLockOpen size={16} />
            ) : (
              <IconLock size={16} />
            )}
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded transition-colors"
            title="Close split view"
          >
            <IconX size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {referenceNote ? (
          <div className="h-full overflow-y-auto">
            {/* Title */}
            <div className="px-4 py-3 border-b border-neutral-200 bg-white">
              <h3 className="font-medium text-neutral-800 truncate">
                {referenceNote.title}
              </h3>
            </div>

            {/* Note content */}
            <div className="p-2">
              {referenceNoteEditable ? (
                <LazyTextBlock
                  noteId={referenceNote.id}
                  value={localContent}
                  onChange={handleContentChange}
                  className="min-h-[300px]"
                  placeholder="Reference note content..."
                />
              ) : (
                <div
                  className="prose prose-sm max-w-none p-4 bg-white rounded-lg shadow-sm"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(referenceNote.content) }}
                />
              )}
            </div>
          </div>
        ) : (
          <EmptyState onSelect={() => {}} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ onSelect }: { onSelect: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
        <IconNotes size={32} className="text-neutral-400" />
      </div>
      <h3 className="text-lg font-medium text-neutral-700 mb-2">
        No Reference Note Selected
      </h3>
      <p className="text-sm text-neutral-500 mb-4 max-w-[200px]">
        Select a note from the dropdown above to reference while writing
      </p>
    </div>
  );
}
