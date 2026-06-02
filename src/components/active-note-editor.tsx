"use client";

import React, { useCallback, useState, useRef, useEffect, useMemo } from "react";
import LazyTextBlock from "@/components/lazy-text-block";
import { useNotesStore, useNotebooks } from "@/stores/notes-store";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useStatusMessage } from "@/hooks/use-status-message";
import { useNoteStatistics } from "@/hooks/use-note-statistics";
import { CombinedNote, NoteSource } from "@/types/combined-notes";
import { NotesOperations } from "@/hooks/use-notes-operations";
import { noteOperation } from "@/app/actions/notes";
import {
  updateNote as updateSupabaseNote,
  updateNoteTitle as updateSupabaseNoteTitle,
} from "@/app/actions/supabaseActions";
import {
  IconPin,
  IconPinFilled,
  IconLock,
  IconLockOpen,
  IconTrash,
  IconCloud,
  IconDeviceDesktop,
  IconDots,
  IconSquareRoundedPlus,
  IconViewportNarrow,
  IconViewportWide,
  IconLayoutColumns,
  IconShare,
  IconHelp,
} from "@tabler/icons-react";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ds/dropdown";
import { Modal, ConfirmModal } from "@/components/ds/modal";
import { IconButton } from "@/components/ds/icon-button";
import ShareNoteButton from "@/components/share-note-button";

interface ActiveNoteEditorProps {
  userId: string;
  isAuthenticated: boolean;
  notesOperations: NotesOperations;
  registerNoteFlush: (noteId: string, flushFn: () => void) => void;
  unregisterNoteFlush: (noteId: string) => void;
  onOpenSplitView?: (note: CombinedNote) => void;
}

export default function ActiveNoteEditor({
  userId,
  isAuthenticated,
  notesOperations,
  registerNoteFlush,
  unregisterNoteFlush,
  onOpenSplitView,
}: ActiveNoteEditorProps) {
  const { activeNoteId, notes, setActiveNoteId } = useNotesStore();
  const note = useMemo(
    () => notes.find((n) => n.id === activeNoteId) || null,
    [notes, activeNoteId],
  );

  if (!note) {
    return <EmptyState onNewNote={() => notesOperations.addNote()} />;
  }

  return (
    <NoteEditor
      key={note.id}
      note={note}
      userId={userId}
      isAuthenticated={isAuthenticated}
      notesOperations={notesOperations}
      registerNoteFlush={registerNoteFlush}
      unregisterNoteFlush={unregisterNoteFlush}
      onOpenSplitView={onOpenSplitView}
    />
  );
}

function EmptyState({ onNewNote }: { onNewNote: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
      <div className="max-w-xs">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
          No note selected
        </h2>
        <p className="text-sm text-[var(--color-text-tertiary)] mb-6 leading-relaxed">
          Select a note from the sidebar or create a new one to get started.
        </p>
        <button
          onClick={onNewNote}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--color-accent)] text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)] rounded-[var(--radius-md)] text-sm font-medium transition-colors duration-[var(--duration-fast)]"
        >
          <IconSquareRoundedPlus size={16} />
          New Note
        </button>
      </div>
    </div>
  );
}

function NoteEditor({
  note,
  userId,
  isAuthenticated,
  notesOperations,
  registerNoteFlush,
  unregisterNoteFlush,
  onOpenSplitView,
}: {
  note: CombinedNote;
  userId: string;
  isAuthenticated: boolean;
  notesOperations: NotesOperations;
  registerNoteFlush: (noteId: string, flushFn: () => void) => void;
  unregisterNoteFlush: (noteId: string) => void;
  onOpenSplitView?: (note: CombinedNote) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [contentFormat, setContentFormat] = useState(note.contentFormat || "html");
  const [isSaving, setIsSaving] = useState(false);
  const [wideMode, setWideMode] = useState(false);
  const [showPagePicker, setShowPagePicker] = useState(false);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [goalInput, setGoalInput] = useState(String(note.goal || ""));

  const titleInputRef = useRef<HTMLInputElement>(null);
  const lastSavedContentRef = useRef(note.content);

  const noteSource = note.source;
  const notebooks = useNotebooks();
  const notebook = note.notebookId
    ? notebooks.find((nb) => nb.id === note.notebookId)
    : null;

  const [pageFormat, setPageFormat] = useState("novel");
  const [goalTarget, setGoalTarget] = useState(note.goal || 0);
  const [goalType, setGoalType] = useState<"" | "words" | "characters">(note.goal_type || "");

  const { wordCount, charCount, readingTime, pageEstimate, progressPercentage } =
    useNoteStatistics(content, pageFormat, { target: goalTarget, type: goalType });

  const saveContent = useCallback(
    async (newContent: string) => {
      if (newContent === lastSavedContentRef.current) return true;

      setIsSaving(true);
      try {
        if (notesOperations.saveNoteContent) {
          await notesOperations.saveNoteContent(
            note.id,
            newContent,
            goalTarget,
            goalType,
          );
        }
        lastSavedContentRef.current = newContent;
        return true;
      } catch {
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [note.id, goalTarget, goalType, notesOperations],
  );

  const { debouncedSave, flushSave } = useAutoSave(content, saveContent);

  useEffect(() => {
    registerNoteFlush(note.id, flushSave);
    return () => unregisterNoteFlush(note.id);
  }, [note.id, flushSave, registerNoteFlush, unregisterNoteFlush]);

  const handleContentChange = useCallback(
    (value: string) => {
      setContent(value);
      setContentFormat("markdown");
      useNotesStore.getState().setEditing(note.id, true);
      debouncedSave();
    },
    [note.id, debouncedSave],
  );

  const handleTitleBlur = useCallback(() => {
    if (title !== note.title) {
      notesOperations.saveNoteTitle?.(note.id, title);
    }
  }, [title, note.id, note.title, notesOperations]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
      }
    },
    [],
  );

  const handleGoalSave = useCallback(() => {
    const target = parseInt(goalInput) || 0;
    setGoalTarget(target);
    notesOperations.saveNoteContent(note.id, content, target, goalType);
  }, [goalInput, note.id, content, goalType, notesOperations]);

  const handleGoalTypeChange = useCallback(
    (type: "words" | "characters") => {
      const target = parseInt(goalInput) || 0;
      setGoalTarget(target);
      setGoalType(type);
      notesOperations.saveNoteContent(note.id, content, target, type);
    },
    [goalInput, note.id, content, notesOperations],
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Minimal toolbar */}
      <div className="flex items-center justify-between px-4 md:px-8 py-1.5 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-text-tertiary)] opacity-60">
            {noteSource === "supabase" ? "Cloud" : "Local"}
          </span>
          {isSaving && (
            <span className="text-[10px] text-[var(--color-text-tertiary)] animate-pulse-subtle">
              Saving...
            </span>
          )}
        </div>

        <div className="flex items-center">
          <IconButton
            label="Formatting help"
            size="sm"
            onClick={() => setShowHelp(true)}
          >
            <IconHelp size={14} />
          </IconButton>

          <div className="w-px h-3 bg-[var(--color-border-secondary)] mx-0.5" />

          <IconButton
            label={wideMode ? "Narrow view" : "Wide view"}
            size="sm"
            onClick={() => setWideMode((w) => !w)}
          >
            {wideMode ? <IconViewportNarrow size={14} /> : <IconViewportWide size={14} />}
          </IconButton>

          {onOpenSplitView && (
            <IconButton
              label="Split view"
              size="sm"
              onClick={() => onOpenSplitView(note)}
            >
              <IconLayoutColumns size={14} />
            </IconButton>
          )}

          <div className="w-px h-3 bg-[var(--color-border-secondary)] mx-0.5" />

          <IconButton
            label={note.isPinned ? "Unpin" : "Pin"}
            size="sm"
            onClick={() => notesOperations.updatePinStatus(note.id, !note.isPinned)}
          >
            {note.isPinned ? (
              <IconPinFilled size={14} className="text-[var(--color-accent)]" />
            ) : (
              <IconPin size={14} />
            )}
          </IconButton>

          <IconButton
            label={note.isPrivate ? "Public" : "Private"}
            size="sm"
            onClick={() => notesOperations.updatePrivacyStatus(note.id, !note.isPrivate)}
          >
            {note.isPrivate ? (
              <IconLock size={14} />
            ) : (
              <IconLockOpen size={14} />
            )}
          </IconButton>

          {isAuthenticated && (
            <ShareNoteButton
              noteId={note.id}
              noteTitle={title}
              noteSource={noteSource}
              isPrivate={note.isPrivate}
              isAuthenticated={isAuthenticated}
              userId={userId}
            />
          )}

          <Dropdown
            trigger={
              <IconButton label="More" size="sm">
                <IconDots size={14} />
              </IconButton>
            }
          >
            <DropdownItem
              icon={<IconTrash size={14} />}
              destructive
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete
            </DropdownItem>
          </Dropdown>
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          notesOperations.deleteNote(note.id);
          setShowDeleteConfirm(false);
        }}
        title="Delete note"
        message={`Are you sure you want to delete "${title}"? This can't be undone.`}
        confirmText="Delete"
        destructive
      />

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className={`mx-auto px-4 md:px-8 py-6 transition-[max-width] duration-[var(--duration-slow)] ${wideMode ? "max-w-none" : "max-w-[var(--content-width)]"}`}>
          {/* Title */}
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            placeholder="Untitled"
            className="w-full text-2xl md:text-3xl font-bold text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] bg-transparent border-none outline-none mb-1"
          />

          {/* Notebook pill + stats */}
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            {notebook && (
              <span className="inline-block px-1.5 py-px text-[9px] font-medium rounded-[var(--radius-sm)] bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
                {notebook.name}
              </span>
            )}
            <span className="text-[10px] text-[var(--color-text-tertiary)] opacity-80">
              <span title={`${wordCount} words`}>{wordCount}w</span> · <span title={`${charCount} characters`}>{charCount}c</span> · <span title="Estimated reading time">{readingTime}</span> ·{" "}
              <button
                onClick={() => setShowPagePicker((s) => !s)}
                className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-text-secondary)] transition-colors"
              >
                {pageEstimate}
              </button>
              {" "}·{" "}
              <button
                onClick={() => setShowGoalPicker((s) => !s)}
                className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-text-secondary)] transition-colors"
              >
                {goalTarget > 0 ? `${Math.round(progressPercentage)}% of ${goalTarget} ${goalType}` : "set goal"}
              </button>
            </span>
            {goalTarget > 0 && (
              <span
                className="inline-block h-1 rounded-full bg-[var(--color-border-primary)] overflow-hidden"
                style={{ width: 40 }}
              >
                <span
                  className="block h-full rounded-full bg-[var(--color-accent)] transition-all duration-300"
                  style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                />
              </span>
            )}
          </div>

          {/* Page size picker */}
          {showPagePicker && (
            <div className="mb-4 flex items-center gap-2 animate-fade-in">
              <label className="text-[10px] text-[var(--color-text-tertiary)] opacity-80">Page size:</label>
              {(["novel", "a4", "a5"] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => { setPageFormat(fmt); setShowPagePicker(false); }}
                  className={`px-2 py-0.5 text-[10px] rounded-[var(--radius-sm)] transition-colors ${
                    pageFormat === fmt
                      ? "bg-[var(--color-accent)] text-[var(--color-text-on-accent)]"
                      : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"
                  }`}
                >
                  {fmt === "novel" ? "Novel" : fmt.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* Goal picker */}
          {showGoalPicker && (
            <div className="mb-4 flex items-center gap-2 animate-fade-in">
              <label className="text-[10px] text-[var(--color-text-tertiary)] opacity-80">Goal:</label>
              <input
                type="number"
                min={0}
                placeholder="0"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleGoalSave();
                    setShowGoalPicker(false);
                  }
                }}
                autoFocus
                className="w-16 h-6 px-2 text-[10px] bg-[var(--color-bg-tertiary)] border border-[var(--color-border-primary)] rounded-[var(--radius-sm)] text-[var(--color-text-primary)] focus:border-[var(--color-border-focus)] focus:outline-none"
              />
              {(["words", "characters"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    const target = parseInt(goalInput) || 0;
                    setGoalTarget(target);
                    setGoalType(t);
                    notesOperations.saveNoteContent(note.id, content, target, t);
                    setShowGoalPicker(false);
                  }}
                  className={`px-2 py-0.5 text-[10px] rounded-[var(--radius-sm)] transition-colors ${
                    goalType === t
                      ? "bg-[var(--color-accent)] text-[var(--color-text-on-accent)]"
                      : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Content editor */}
          <LazyTextBlock
            noteId={note.id}
            value={content}
            contentFormat={contentFormat}
            onChange={handleContentChange}
            distractionFreeMode
            placeholder="Start writing..."
          />
        </div>
      </div>

      {/* Formatting help modal */}
      <Modal open={showHelp} onClose={() => setShowHelp(false)} title="Formatting" size="sm">
        <div className="space-y-0.5 text-xs">
          <p className="text-[10px] text-[var(--color-text-tertiary)] mb-3">
            Select text to show the formatting toolbar. You can also type markdown directly:
          </p>
          {[
            ["**bold**", "Bold text"],
            ["*italic*", "Italic text"],
            ["~~strikethrough~~", "Strikethrough"],
            ["`code`", "Inline code"],
            ["# Heading 1", "Large heading"],
            ["## Heading 2", "Medium heading"],
            ["### Heading 3", "Small heading"],
            ["- item", "Bullet list"],
            ["1. item", "Numbered list"],
            ["- [ ] task", "Task / checkbox"],
            ["- [x] done", "Completed task"],
            ["> quote", "Blockquote"],
            ["```", "Code block"],
            ["---", "Horizontal rule"],
            ["[text](url)", "Link"],
            ["![alt](url)", "Image"],
          ].map(([syntax, desc]) => (
            <div key={syntax} className="flex items-center justify-between py-1.5 border-b border-[var(--color-border-secondary)] last:border-0">
              <code className="px-1.5 py-0.5 bg-[var(--color-bg-tertiary)] rounded-[var(--radius-sm)] text-[11px] font-mono text-[var(--color-text-secondary)]">
                {syntax}
              </code>
              <span className="text-[var(--color-text-tertiary)]">{desc}</span>
            </div>
          ))}
          <p className="text-[10px] text-[var(--color-text-tertiary)] pt-3">
            Keyboard: <kbd className="px-1 py-px bg-[var(--color-bg-tertiary)] rounded text-[10px] font-mono">Ctrl+B</kbd> bold · <kbd className="px-1 py-px bg-[var(--color-bg-tertiary)] rounded text-[10px] font-mono">Ctrl+I</kbd> italic · <kbd className="px-1 py-px bg-[var(--color-bg-tertiary)] rounded text-[10px] font-mono">Ctrl+Z</kbd> undo
          </p>
        </div>
      </Modal>
    </div>
  );
}
