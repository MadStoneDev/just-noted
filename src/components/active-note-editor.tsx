"use client";

import React, { useCallback, useState, useRef, useEffect, useMemo } from "react";

const LAST_NOTE_KEY = "justnoted_last_note";
import LazyTextBlock from "@/components/lazy-text-block";
import { useNotesStore, useNotebooks } from "@/stores/notes-store";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useNoteStatistics } from "@/hooks/use-note-statistics";
import { CombinedNote } from "@/types/combined-notes";
import { NotesOperations } from "@/hooks/use-notes-operations";
import {
  IconPin,
  IconPinFilled,
  IconLock,
  IconLockOpen,
  IconTrash,
  IconDots,
  IconSquareRoundedPlus,
  IconViewportNarrow,
  IconViewportWide,
  IconLayoutColumns,
  IconShare,
  IconHelp,
  IconHistory,
  IconNotebook,
  IconX,
  IconPrinter,
  IconSelector,
} from "@tabler/icons-react";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ds/dropdown";
import NotebookMoveMenu from "@/components/notebook-move-menu";
import { assignNoteToNotebook } from "@/app/actions/notebookActions";
import { Modal, ConfirmModal } from "@/components/ds/modal";
import VersionHistoryPanel from "@/components/version-history-panel";
import GoalSuggestionsModal from "@/components/goal-suggestions-modal";
import SplitToolbar, { SplitToolbarMobile } from "@/components/editor/split-toolbar";
import { saveVersion } from "@/app/actions/versionActions";
import { IconButton } from "@/components/ds/icon-button";
import ShareNoteButton from "@/components/share-note-button";

interface ActiveNoteEditorProps {
  userId: string;
  isAuthenticated: boolean;
  notesOperations: NotesOperations;
  registerNoteFlush: (noteId: string, flushFn: () => void) => void;
  unregisterNoteFlush: (noteId: string) => void;
}

export default function ActiveNoteEditor({
  userId,
  isAuthenticated,
  notesOperations,
  registerNoteFlush,
  unregisterNoteFlush,
}: ActiveNoteEditorProps) {
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const notes = useNotesStore((s) => s.notes);
  const setActiveNoteId = useNotesStore((s) => s.setActiveNoteId);
  const isLoading = useNotesStore((s) => s.isLoading);
  const [splitNoteId, setSplitNoteId] = useState<string | null>(null);

  // Auto-select: restore last opened note, or pick most recent
  useEffect(() => {
    if (activeNoteId || notes.length === 0) return;

    const lastId = localStorage.getItem(LAST_NOTE_KEY);
    if (lastId && notes.find((n) => n.id === lastId)) {
      setActiveNoteId(lastId);
    } else {
      setActiveNoteId(notes[0].id);
    }
  }, [activeNoteId, notes, setActiveNoteId]);

  // Persist active note to localStorage
  useEffect(() => {
    if (activeNoteId) {
      localStorage.setItem(LAST_NOTE_KEY, activeNoteId);
    }
  }, [activeNoteId]);

  const note = useMemo(
    () => notes.find((n) => n.id === activeNoteId) || null,
    [notes, activeNoteId],
  );

  const splitNote = splitNoteId ? notes.find((n) => n.id === splitNoteId) || null : null;
  const [syncScroll, setSyncScroll] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  // Track text selection for split toolbar
  useEffect(() => {
    if (!splitNoteId) return;
    const check = () => {
      const sel = window.getSelection();
      setHasSelection(!!sel && !sel.isCollapsed && sel.toString().length > 0);
    };
    document.addEventListener("selectionchange", check);
    return () => document.removeEventListener("selectionchange", check);
  }, [splitNoteId]);

  // Sync scroll between panes (uses inner scrollable refs from NoteEditor)
  useEffect(() => {
    if (!syncScroll || !leftScrollRef.current || !rightScrollRef.current) return;
    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    let syncing = false;

    const syncLeft = () => {
      if (syncing) return;
      syncing = true;
      right.scrollTop = left.scrollTop;
      requestAnimationFrame(() => { syncing = false; });
    };
    const syncRight = () => {
      if (syncing) return;
      syncing = true;
      left.scrollTop = right.scrollTop;
      requestAnimationFrame(() => { syncing = false; });
    };

    left.addEventListener("scroll", syncLeft);
    right.addEventListener("scroll", syncRight);
    return () => {
      left.removeEventListener("scroll", syncLeft);
      right.removeEventListener("scroll", syncRight);
    };
  }, [syncScroll, splitNoteId]);

  const handleFindInOther = useCallback((direction: "left" | "right") => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString();
    if (!text) return;

    const pane = direction === "left" ? leftPaneRef.current : rightPaneRef.current;
    if (!pane) return;

    // Find text in the target pane's ProseMirror content
    const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const idx = (node.textContent || "").indexOf(text);
      if (idx >= 0) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + text.length);
        sel.removeAllRanges();
        sel.addRange(range);
        (node as any).parentElement?.scrollIntoView({ behavior: "smooth", block: "center" });
        break;
      }
    }
  }, []);

  const handleCopyToOther = useCallback((direction: "left" | "right") => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString();
    if (!text) return;

    // Insert at the end of the target note
    const targetNote = direction === "left" ? note : splitNote;
    if (!targetNote) return;
    const newContent = targetNote.content + "\n\n" + text;
    notesOperations.saveNoteContent(targetNote.id, newContent, targetNote.goal || 0, targetNote.goal_type || "");
  }, [note, splitNote, notesOperations]);

  const handleSwapPanes = useCallback(() => {
    if (!splitNote || !note) return;
    const currentSplitId = splitNoteId;
    setActiveNoteId(splitNote.id);
    setSplitNoteId(note.id);
  }, [note, splitNote, splitNoteId, setActiveNoteId]);

  if (isLoading && notes.length === 0) {
    return <LoadingSkeleton />;
  }

  if (!note) {
    return <EmptyState onNewNote={() => notesOperations.addNote()} />;
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden relative">
      {/* Main editor */}
      <div ref={leftPaneRef} className={`flex-1 min-w-0 overflow-y-auto ${splitNote ? "border-r border-[var(--color-border-secondary)]" : ""}`}>
        <NoteEditor
          key={note.id}
          note={note}
          userId={userId}
          isAuthenticated={isAuthenticated}
          notesOperations={notesOperations}
          registerNoteFlush={registerNoteFlush}
          unregisterNoteFlush={unregisterNoteFlush}
          onToggleSplit={() => setSplitNoteId(splitNoteId ? null : "pick")}
          scrollRef={leftScrollRef}
        />
      </div>

      {/* Split toolbar */}
      {splitNote && (
        <>
          <SplitToolbar
            onFindInOther={handleFindInOther}
            onSyncScrollToggle={() => setSyncScroll((s) => !s)}
            syncScroll={syncScroll}
            onCopyToOther={handleCopyToOther}
            onSwap={handleSwapPanes}
            onClose={() => setSplitNoteId(null)}
            hasSelection={hasSelection}
          />
          <SplitToolbarMobile
            onFindInOther={handleFindInOther}
            onSyncScrollToggle={() => setSyncScroll((s) => !s)}
            syncScroll={syncScroll}
            onCopyToOther={handleCopyToOther}
            onSwap={handleSwapPanes}
            onClose={() => setSplitNoteId(null)}
            hasSelection={hasSelection}
          />
        </>
      )}

      {/* Split pane */}
      {splitNoteId && (
        <div ref={rightPaneRef} className="flex-1 min-w-0 flex flex-col bg-[var(--color-bg-primary)] overflow-y-auto">
          {splitNote ? (
            <NoteEditor
              key={splitNote.id}
              note={splitNote}
              userId={userId}
              isAuthenticated={isAuthenticated}
              notesOperations={notesOperations}
              registerNoteFlush={registerNoteFlush}
              unregisterNoteFlush={unregisterNoteFlush}
              onToggleSplit={() => setSplitNoteId(null)}
              onChangeSplitNote={() => setSplitNoteId("pick")}
              scrollRef={rightScrollRef}
            />
          ) : (
            /* Note picker */
            <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-[var(--color-text-tertiary)]">Choose a note</p>
                <button
                  onClick={() => setSplitNoteId(null)}
                  className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                >
                  <IconX size={14} />
                </button>
              </div>
              <div className="flex flex-col gap-0.5">
                {notes
                  .filter((n) => n.id !== note.id && !n.deletedAt)
                  .map((n) => (
                    <button
                      key={n.id}
                      onClick={() => setSplitNoteId(n.id)}
                      className="w-full text-left px-3 py-2 rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors"
                    >
                      <p className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">{n.title}</p>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 md:px-8 py-1.5 border-b border-[var(--color-border-secondary)]">
        <div className="skeleton h-3 w-12 rounded" />
        <div className="flex gap-1">
          <div className="skeleton h-7 w-7 rounded-[var(--radius-md)]" />
          <div className="skeleton h-7 w-7 rounded-[var(--radius-md)]" />
          <div className="skeleton h-7 w-7 rounded-[var(--radius-md)]" />
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="max-w-[var(--content-width)] mx-auto px-4 md:px-8 py-6">
          <div className="skeleton h-8 w-2/3 rounded mb-3" />
          <div className="skeleton h-3 w-40 rounded mb-8" />
          <div className="space-y-3">
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-5/6 rounded" />
            <div className="skeleton h-4 w-4/5 rounded" />
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-3/4 rounded" />
          </div>
        </div>
      </div>
    </div>
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
  onToggleSplit,
  onChangeSplitNote,
  scrollRef,
}: {
  note: CombinedNote;
  userId: string;
  isAuthenticated: boolean;
  notesOperations: NotesOperations;
  registerNoteFlush: (noteId: string, flushFn: () => void) => void;
  unregisterNoteFlush: (noteId: string) => void;
  onToggleSplit?: () => void;
  onChangeSplitNote?: () => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
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
  const [showVersions, setShowVersions] = useState(false);
  const [showGoalSuggestions, setShowGoalSuggestions] = useState(false);
  const lastVersionRef = useRef<number>(0);
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

        // Save version snapshot every 5 minutes
        const now = Date.now();
        if (now - lastVersionRef.current > 300000 && isAuthenticated) {
          lastVersionRef.current = now;
          saveVersion(note.id, title, newContent, "markdown").catch(() => {});
        }
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
      <div className="print:hidden flex items-center justify-between px-4 md:px-8 py-1.5 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)]">
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

          {isAuthenticated && (
            <IconButton
              label="Version history"
              size="sm"
              onClick={() => setShowVersions(true)}
            >
              <IconHistory size={14} />
            </IconButton>
          )}

          <div className="w-px h-3 bg-[var(--color-border-secondary)] mx-0.5" />

          <span className="hidden md:inline-flex">
            <IconButton
              label={wideMode ? "Narrow view" : "Wide view"}
              size="sm"
              onClick={() => setWideMode((w) => !w)}
            >
              {wideMode ? <IconViewportNarrow size={14} /> : <IconViewportWide size={14} />}
            </IconButton>
          </span>

          {onChangeSplitNote && (
            <span className="hidden md:inline-flex">
              <IconButton
                label="Change note"
                size="sm"
                onClick={onChangeSplitNote}
              >
                <IconSelector size={14} />
              </IconButton>
            </span>
          )}

          {onToggleSplit && (
            <span className="hidden md:inline-flex">
              <IconButton
                label="Split view"
                size="sm"
                onClick={onToggleSplit}
              >
                <IconLayoutColumns size={14} />
              </IconButton>
            </span>
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

          <IconButton
            label="Print"
            size="sm"
            onClick={() => window.print()}
          >
            <IconPrinter size={14} />
          </IconButton>

          <Dropdown
            trigger={
              <IconButton label="More" size="sm">
                <IconDots size={14} />
              </IconButton>
            }
          >
            {isAuthenticated && notebooks.length > 0 && (
              <>
                <NotebookMoveMenu
                  notebooks={notebooks}
                  currentNotebookId={note.notebookId}
                  onMove={async (notebookId) => {
                    if (notebookId === note.notebookId) return;
                    const { optimisticUpdateNote, recalculateNotebookCounts } = useNotesStore.getState();
                    optimisticUpdateNote(note.id, { notebookId });
                    try {
                      const result = await assignNoteToNotebook(note.id, notebookId);
                      if (result.success) {
                        recalculateNotebookCounts();
                      } else {
                        optimisticUpdateNote(note.id, { notebookId: note.notebookId });
                      }
                    } catch {
                      optimisticUpdateNote(note.id, { notebookId: note.notebookId });
                    }
                  }}
                />
                <DropdownSeparator />
              </>
            )}
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
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
          <div className="print:hidden flex items-center gap-2 flex-wrap">
            {notebook && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-px text-[9px] font-medium rounded-[var(--radius-sm)] bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
                <IconNotebook size={8} className="shrink-0" />
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
                type="text"
                inputMode="numeric"
                placeholder="e.g. 50000"
                value={goalInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  setGoalInput(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleGoalSave();
                    setShowGoalPicker(false);
                  }
                }}
                autoFocus
                className="w-24 h-7 px-2.5 text-xs bg-[var(--color-bg-tertiary)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] focus:border-[var(--color-border-focus)] focus:outline-none"
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
              <button
                onClick={() => setShowGoalSuggestions(true)}
                className="px-2 py-0.5 text-[10px] text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] underline decoration-dotted underline-offset-2 transition-colors"
              >
                suggestions
              </button>
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

      {/* Goal suggestions */}
      <GoalSuggestionsModal
        open={showGoalSuggestions}
        onClose={() => setShowGoalSuggestions(false)}
        onSelect={(value, type) => {
          setGoalInput(String(value));
          setGoalTarget(value);
          setGoalType(type);
          notesOperations.saveNoteContent(note.id, content, value, type);
          setShowGoalPicker(false);
        }}
      />

      {/* Version history */}
      <VersionHistoryPanel
        noteId={note.id}
        open={showVersions}
        onClose={() => setShowVersions(false)}
        onRestore={(restoredContent, restoredTitle) => {
          setContent(restoredContent);
          setTitle(restoredTitle);
          setContentFormat("markdown");
          notesOperations.saveNoteContent(note.id, restoredContent, goalTarget, goalType);
          notesOperations.saveNoteTitle?.(note.id, restoredTitle);
        }}
      />
    </div>
  );
}
