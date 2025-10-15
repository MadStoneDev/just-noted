﻿// src/components/note-block/index.tsx
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";

import TextBlock from "@/components/text-block";
import type { CombinedNote } from "@/types/combined-notes";
import type { NoteSource } from "@/types/combined-notes";

import { IconCircleCheck, IconCircleX, IconLoader } from "@tabler/icons-react";

import {
  updateNote as updateSupabaseNote,
  updateNoteTitle as updateSupabaseNoteTitle,
} from "@/app/actions/supabaseActions";

import { useAutoSave } from "@/hooks/use-auto-save";
import { useStatusMessage } from "@/hooks/use-status-message";
import { useNoteStatistics } from "@/hooks/use-note-statistics";
import { useNoteActions } from "@/hooks/use-note-actions";

import NoteHeader from "./note-header";
import NoteActions from "./note-actions";
import NoteStatistics from "./note-statistics";
import NoteToolbar from "./note-toolbar";
import PageEstimateModal from "@/components/page-estimate-modal";
import WordCountGoalModal from "@/components/word-count-goal-modal";
import { noteOperation } from "@/app/actions/notes";

import { useNotesStore } from "@/stores/notes-store";

// Type definition for the word count goal
interface WordCountGoal {
  target: number;
  type: "" | "words" | "characters";
}

interface NoteBlockProps {
  details: CombinedNote;
  userId: string;
  showDelete?: boolean;
  onDelete?: (noteId: string) => void;
  onPinStatusChange?: (noteId: string, isPinned: boolean) => void;
  onPrivacyStatusChange?: (noteId: string, isPrivate: boolean) => void;
  onCollapsedStatusChange?: (noteId: string, isCollapsed: boolean) => void;
  isFirstPinned?: boolean;
  isLastPinned?: boolean;
  isFirstUnpinned?: boolean;
  isLastUnpinned?: boolean;
  onReorder?: (noteId: string, direction: "up" | "down") => void;
  noteSource?: NoteSource;
  onTransferNote?: (noteId: string, targetSource: NoteSource) => void;
  isTransferring?: boolean;
  shareableNote?: boolean;
  isAuthenticated?: boolean;
  onRegisterFlush?: (noteId: string, flushFn: () => void) => void;
  onUnregisterFlush?: (noteId: string) => void;
  setActiveNote?: (note: CombinedNote | null) => void;
  openDistractionFreeNote?: () => void;
  distractionFreeMode?: boolean;
  saveNoteContent?: (
    noteId: string,
    content: string,
    goal: number,
    goalType: "" | "words" | "characters",
  ) => Promise<{ success: boolean }>;
  saveNoteTitle?: (
    noteId: string,
    title: string,
  ) => Promise<{ success: boolean }>;
}

export default function NoteBlock({
  details,
  userId,
  showDelete = true,
  onDelete,
  onPinStatusChange,
  onPrivacyStatusChange,
  onCollapsedStatusChange,
  isFirstPinned = false,
  isLastPinned = false,
  isFirstUnpinned = false,
  isLastUnpinned = false,
  onReorder,
  noteSource = "redis",
  onTransferNote,
  isTransferring = false,
  isAuthenticated = false,
  onRegisterFlush,
  onUnregisterFlush,
  openDistractionFreeNote,
  distractionFreeMode = false,
  saveNoteContent,
  saveNoteTitle,
}: NoteBlockProps) {
  // ========== ZUSTAND - Read latest note data ==========
  const latestNote = useNotesStore((state) =>
    state.notes.find((n) => n.id === details.id),
  );
  const isSaving = useNotesStore((state) => state.isSaving.has(details.id));
  const isEditing = useNotesStore((state) => state.isEditing.has(details.id));

  // Use Zustand data if available, otherwise fall back to props
  const currentNote = latestNote || details;

  const { newNoteId } = useNotesStore();
  const notes = useNotesStore((state) => state.notes);

  const isNewNote = details.id === newNoteId;
  const hasPinnedNotes = notes.some(
    (note) => note.isPinned && note.id !== details.id,
  );

  // ========== CUSTOM HOOKS ==========
  const { message: saveStatus, icon: saveIcon, setStatus } = useStatusMessage();

  // ========== STATE ==========
  const [noteTitle, setNoteTitle] = useState(currentNote.title);
  const [noteContent, setNoteContent] = useState(currentNote.content);
  const [editingTitle, setEditingTitle] = useState(false);
  const [transferComplete, setTransferComplete] = useState(false);
  const [isContentVisible, setIsContentVisible] = useState(true);
  const [isContentExpanded, setIsContentExpanded] = useState(true);
  const [currentPageFormat, setCurrentPageFormat] = useState<string>("novel");
  const [showPageEstimateModal, setShowPageEstimateModal] = useState(false);
  const [showWordCountGoalModal, setShowWordCountGoalModal] = useState(false);
  const [isPending, setIsPending] = useState(false);

  // Word count goal tracking
  const [wordCountGoal, setWordCountGoal] = useState<WordCountGoal | null>(
    () => {
      if (
        currentNote.goal &&
        currentNote.goal_type &&
        (currentNote.goal_type === "words" ||
          currentNote.goal_type === "characters")
      ) {
        return {
          target: currentNote.goal || 0,
          type: currentNote.goal_type as "" | "words" | "characters",
        };
      }
      return null;
    },
  );

  // ========== DERIVED STATE (useMemo) ==========
  const isPinned = useMemo(
    () => currentNote.isPinned || false,
    [currentNote.isPinned],
  );
  const isPrivate = useMemo(
    () => currentNote.isPrivate || false,
    [currentNote.isPrivate],
  );

  const canMoveUp = useMemo(
    () => (isPinned ? !isFirstPinned : !isFirstUnpinned),
    [isPinned, isFirstPinned, isFirstUnpinned],
  );

  const canMoveDown = useMemo(
    () => (isPinned ? !isLastPinned : !isLastUnpinned),
    [isPinned, isLastPinned, isLastUnpinned],
  );

  // ========== STATISTICS (from hook) ==========
  const {
    wordCount,
    charCount,
    readingTime,
    pageEstimate,
    progressPercentage,
  } = useNoteStatistics(noteContent, currentPageFormat, wordCountGoal);

  // ========== ACTIONS (from hook) ==========
  const {
    handleTogglePin,
    handleTogglePrivacy,
    handleMoveNote,
    isPinUpdating,
    isPrivacyUpdating,
    isReordering,
  } = useNoteActions({
    noteId: details.id,
    onPinStatusChange,
    onPrivacyStatusChange,
    onReorder,
    setStatus,
  });

  // ========== REFS ==========
  const containerRef = useRef<HTMLElement | null>(null);
  const lastSavedContentRef = useRef(currentNote.content);
  const saveCounterRef = useRef(0);
  const pendingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevIsTransferring = useRef(false);
  const collapseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const collapseSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wordCountGoalRef = useRef(wordCountGoal);

  // ========== SYNC LOCAL STATE WITH ZUSTAND ==========
  useEffect(() => {
    if (
      !isSaving &&
      !isEditing &&
      currentNote.content !== noteContent &&
      currentNote.content !== lastSavedContentRef.current
    ) {
      setNoteContent(currentNote.content);
      lastSavedContentRef.current = currentNote.content;
    }
  }, [
    currentNote.title,
    currentNote.content,
    currentNote.updatedAt,
    editingTitle,
    isSaving,
    isEditing,
  ]);

  // ========== FUNCTIONS ==========
  const getActiveEditorContent = useCallback((): string => {
    return noteContent;
  }, [noteContent]);

  // Toggle visibility of note content
  const toggleContentVisibility = () => {
    const newCollapsedState = isContentExpanded;

    if (isContentExpanded) {
      setIsContentExpanded(false);
      collapseTimeoutRef.current = setTimeout(() => {
        setIsContentVisible(false);
      }, 300);
    } else {
      setIsContentVisible(true);
      requestAnimationFrame(() => {
        setIsContentExpanded(true);
      });
    }

    if (collapseSaveTimeoutRef.current) {
      clearTimeout(collapseSaveTimeoutRef.current);
    }

    collapseSaveTimeoutRef.current = setTimeout(() => {
      saveCollapsedState(newCollapsedState);
    }, 300);
  };

  const saveCollapsedState = (isCollapsed: boolean) => {
    try {
      if (onCollapsedStatusChange) {
        onCollapsedStatusChange(details.id, isCollapsed);
      } else {
        console.error("No onCollapsedStatusChange callback provided");
      }
    } catch (error) {
      console.error("Error in saveCollapsedState:", error);
    }
  };

  // Title editing handlers
  const handleEditTitle = () => {
    setEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    if (noteTitle.trim() === "") {
      setNoteTitle(currentNote.title);
      setEditingTitle(false);
      return;
    }

    setEditingTitle(false);
    setStatus(
      "Saving title...",
      <IconLoader className="animate-spin" />,
      false,
      10000,
    );

    try {
      let result;
      if (saveNoteTitle) {
        result = await saveNoteTitle(details.id, noteTitle);
      } else {
        if (noteSource === "redis") {
          result = await noteOperation("redis", {
            operation: "updateTitle",
            userId,
            noteId: details.id,
            title: noteTitle,
          });
        } else {
          result = await updateSupabaseNoteTitle(details.id, noteTitle);
        }
      }

      if (result.success) {
        setStatus(
          "Title saved",
          <IconCircleCheck className="text-mercedes-primary" />,
          false,
          2000,
        );
      } else {
        setStatus(
          "Title save failed",
          <IconCircleX className="text-red-700" />,
          true,
          3000,
        );
        console.error("Failed to save title");
      }
    } catch (error) {
      console.error("Error updating note title:", error);
      setStatus(
        "Title save failed",
        <IconCircleX className="text-red-700" />,
        true,
        3000,
      );
    }
  };

  const handleCancelEditTitle = () => {
    setNoteTitle(currentNote.title);
    setEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSaveTitle().then();
    } else if (e.key === "Escape") {
      handleCancelEditTitle();
    }
  };

  // Export functionality
  const handleExportTxt = () => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = noteContent;
    const plainText = tempDiv.textContent || tempDiv.innerText || "";
    const textContent = `${noteTitle}\n\n${plainText}`;
    const blob = new Blob([textContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${noteTitle.replace(/\s+/g, "-").toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  // Transfer functionality
  const handleTransferNote = async (targetSource: NoteSource) => {
    if (!onTransferNote) {
      setStatus(
        "Transfer not available",
        <IconCircleX className="text-red-700" />,
        true,
        3000,
      );
      return;
    }

    if (targetSource === "supabase" && !isAuthenticated) {
      alert("You need to be signed in to save notes to the cloud.");
      return;
    }

    try {
      flushAutoSave();

      const currentContent = getActiveEditorContent();

      if (currentContent !== lastSavedContentRef.current) {
        setStatus(
          "Saving latest changes...",
          <IconLoader className="animate-spin" />,
          false,
          5000,
        );

        await saveContent(currentContent, true);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      setStatus(
        "Transferring...",
        <IconLoader className="animate-spin" />,
        false,
        10000,
      );

      onTransferNote(details.id, targetSource);

      setStatus(
        "Transfer complete!",
        <IconCircleCheck className="text-mercedes-primary" />,
        false,
        2000,
      );
    } catch (error) {
      console.error("Transfer error:", error);
      setStatus(
        "Transfer failed",
        <IconCircleX className="text-red-700" />,
        true,
        3000,
      );
    }
  };

  // Page format change
  const handlePageFormatChange = (format: string) => {
    setCurrentPageFormat(format);
    setShowPageEstimateModal(false);
  };

  // Word count goal change
  const handleWordCountGoalChange = (goal: WordCountGoal | null) => {
    setWordCountGoal(goal);
    setShowWordCountGoalModal(false);

    if (goal) {
      setStatus(
        "Saving goal...",
        <IconLoader className="animate-spin" />,
        false,
        10000,
      );

      setTimeout(() => {
        setStatus(
          "Goal saved",
          <IconCircleCheck className="text-mercedes-primary" />,
          false,
          2000,
        );
      }, 2000);
    } else {
      setStatus(
        "Goal cleared",
        <IconCircleCheck className="text-mercedes-primary" />,
        false,
        2000,
      );
    }
  };

  // Create a stable save function using refs
  const saveContentRef =
    useRef<
      (
        content: string,
        isManualSave?: boolean,
        forceUpdate?: boolean,
      ) => Promise<void> | undefined
    >(undefined);

  const saveContent = useCallback(
    async (content: string, isManual = false) => {
      const safeContent = content
        .replace(/<p><br\s*\/?><\/p>/gi, "<p>&nbsp;</p>")
        .replace(/<p>\s*<\/p>/gi, "<p>&nbsp;</p>");

      if (safeContent === lastSavedContentRef.current && !isManual) {
        return;
      }

      setStatus(
        "Saving...",
        <IconLoader className="animate-spin" />,
        false,
        10000,
      );
      setIsPending(true);

      const startTime = Date.now();

      try {
        let result;
        if (saveNoteContent) {
          result = await saveNoteContent(
            details.id,
            safeContent,
            wordCountGoalRef.current?.target || 0,
            wordCountGoalRef.current?.type || "",
          );
        } else {
          if (noteSource === "redis") {
            result = await noteOperation("redis", {
              operation: "update",
              userId,
              noteId: details.id,
              content: safeContent,
              goal: wordCountGoalRef.current?.target || 0,
              goalType: wordCountGoalRef.current?.type || "",
            });
          } else {
            result = await updateSupabaseNote(
              details.id,
              safeContent,
              wordCountGoalRef.current?.target || 0,
              wordCountGoalRef.current?.type || "",
            );
          }
        }

        const elapsed = Date.now() - startTime;
        const remainingDelay = Math.max(0, 1000 - elapsed);

        if (remainingDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, remainingDelay));
        }

        if (result.success) {
          lastSavedContentRef.current = safeContent;

          setStatus(
            "Saved",
            <IconCircleCheck className="text-mercedes-primary" />,
            false,
            2000,
          );
        } else {
          setStatus(
            "Failed to save",
            <IconCircleX className="text-red-700" />,
            true,
            3000,
          );
        }
      } catch (error) {
        setStatus(
          "Error saving",
          <IconCircleX className="text-red-700" />,
          true,
          3000,
        );
      } finally {
        setIsPending(false);
      }
    },
    [userId, details.id, noteSource, setStatus, saveNoteContent],
  );

  const { debouncedSave, flushSave } = useAutoSave(
    noteContent,
    saveContent,
    2000,
  );

  const flushAutoSave = useCallback(() => {
    if (pendingTimeoutRef.current) {
      clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
      saveContentRef.current?.(noteContent, false);
    }
  }, [noteContent]);

  const cancelAutoSave = useCallback(() => {
    if (pendingTimeoutRef.current) {
      clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }
  }, []);

  // Update the ref whenever saveContent changes
  useEffect(() => {
    saveContentRef.current = saveContent;
  }, [saveContent]);

  const handleChange = useCallback(
    (value: string) => {
      setNoteContent(value);

      debouncedSave();
    },
    [debouncedSave],
  );

  // Manual save function
  const handleManualSave = useCallback(async () => {
    await saveContent(noteContent, true);
  }, [saveContent, noteContent]);

  // ========== EFFECTS ==========
  useEffect(() => {
    setIsContentExpanded(!(currentNote.isCollapsed || false));
    setIsContentVisible(!(currentNote.isCollapsed || false));

    if (currentNote.goal || currentNote.goal_type) {
      setWordCountGoal({
        target: currentNote.goal || 0,
        type:
          currentNote.goal_type === "words" ||
          currentNote.goal_type === "characters"
            ? currentNote.goal_type
            : "",
      });
    }

    return () => {
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
      }

      flushAutoSave();
      cancelAutoSave();

      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
      }

      if (collapseSaveTimeoutRef.current) {
        clearTimeout(collapseSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isTransferring) {
      setTransferComplete(false);
    } else if (transferComplete) {
      const timeout = setTimeout(() => {
        setTransferComplete(false);
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [isTransferring, transferComplete]);

  useEffect(() => {
    if (!isTransferring && prevIsTransferring.current) {
      setTransferComplete(true);
    }
    prevIsTransferring.current = isTransferring;
  }, [isTransferring]);

  useEffect(() => {
    if (onRegisterFlush) {
      onRegisterFlush(details.id, flushSave);
    }
    return () => {
      if (onUnregisterFlush) {
        onUnregisterFlush(details.id);
      }
    };
  }, [details.id, flushSave, onRegisterFlush, onUnregisterFlush]);

  useEffect(() => {
    return () => {
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (currentNote.isCollapsed !== undefined) {
      setIsContentExpanded(!currentNote.isCollapsed);
      setIsContentVisible(!currentNote.isCollapsed);
    }
  }, [currentNote.isCollapsed]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isPending) {
        flushAutoSave();
        e.preventDefault();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isPending, flushAutoSave]);

  useEffect(() => {
    wordCountGoalRef.current = wordCountGoal;
  }, [wordCountGoal]);

  // ========== RENDER ==========
  if (!details) {
    return null;
  }

  return (
    <section
      ref={containerRef}
      className={`py-2 px-4 relative col-span-12 flex flex-col gap-3 ${
        distractionFreeMode ? "h-full" : ""
      }`}
    >
      {/* Transfer Loading Overlay */}
      {isTransferring && (
        <div className="absolute inset-0 bg-neutral-900/50 bg-opacity-25 flex items-center justify-center rounded-xl z-10">
          <div className="bg-white px-4 py-2 rounded-lg shadow-lg">
            <span className="flex items-center gap-2">
              <svg
                className={`animate-spin h-5 w-5 ${
                  noteSource === "supabase"
                    ? "text-orange-600"
                    : "text-blue-600"
                }`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Transferring...
            </span>
          </div>
        </div>
      )}

      {/* Transfer Complete Overlay */}
      {transferComplete && (
        <div className="absolute inset-0 bg-neutral-900/50 flex items-center justify-center rounded-xl z-10 animate-fadeOut">
          <div className="bg-white px-4 py-2 rounded-lg shadow-lg">
            <span className="flex items-center gap-2 text-mercedes-primary">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Transfer Complete
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <NoteHeader
        noteTitle={noteTitle}
        isPrivate={isPrivate}
        isPinned={isPinned}
        noteSource={noteSource}
        editingTitle={editingTitle}
        saveStatus={saveStatus}
        saveIcon={saveIcon}
        isNewNote={isNewNote}
        hasPinnedNotes={hasPinnedNotes}
        onEditTitle={handleEditTitle}
        onSaveTitle={handleSaveTitle}
        onCancelEdit={handleCancelEditTitle}
        onTitleChange={setNoteTitle}
        onTitleKeyDown={handleTitleKeyDown}
      />

      {/* Actions */}
      <NoteActions
        isPinned={isPinned}
        isPrivate={isPrivate}
        isPinUpdating={isPinUpdating}
        isPrivacyUpdating={isPrivacyUpdating}
        isReordering={isReordering}
        isContentVisible={isContentVisible}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        distractionFreeMode={distractionFreeMode}
        isSaving={isSaving}
        onTogglePin={() => handleTogglePin(isPinned)}
        onTogglePrivacy={() => handleTogglePrivacy(isPrivate)}
        onToggleVisibility={toggleContentVisibility}
        onMoveUp={() => handleMoveNote("up")}
        onMoveDown={() => handleMoveNote("down")}
        onOpenDistractionFree={openDistractionFreeNote}
      />

      {/* Note Content */}
      <div
        className={`note-content-wrapper overflow-hidden transition-all duration-300 ease-in-out ${
          distractionFreeMode
            ? "flex-grow"
            : isContentExpanded
              ? "max-h-[900px] md:max-h-[600px]"
              : "max-h-0"
        }`}
      >
        {isContentVisible && (
          <>
            <article
              className={`grid grid-cols-12 gap-4 ${
                distractionFreeMode ? "h-full" : ""
              }`}
            >
              {/* Editor */}
              <div
                className={`col-span-12 ${
                  distractionFreeMode
                    ? ""
                    : "sm:col-span-8 md:col-span-9 3xl:col-span-10"
                } rounded-xl overflow-hidden`}
              >
                <TextBlock
                  noteId={details.id}
                  value={noteContent}
                  onChange={handleChange}
                  distractionFreeMode={distractionFreeMode}
                  placeholder="Just start typing..."
                />
              </div>

              {/* Statistics */}
              {!distractionFreeMode && (
                <NoteStatistics
                  wordCount={wordCount}
                  charCount={charCount}
                  readingTime={readingTime}
                  pageEstimate={pageEstimate}
                  currentPageFormat={currentPageFormat}
                  progressPercentage={progressPercentage}
                  wordCountGoal={wordCountGoal}
                  isPrivate={isPrivate}
                  onOpenPageEstimateModal={() => setShowPageEstimateModal(true)}
                  onOpenWordCountGoalModal={() =>
                    setShowWordCountGoalModal(true)
                  }
                />
              )}
            </article>

            {/* Toolbar */}
            <NoteToolbar
              noteId={details.id}
              userId={userId}
              noteTitle={noteTitle}
              noteSource={noteSource}
              isPrivate={isPrivate}
              isPinned={isPinned}
              isPending={isPending}
              isAuthenticated={isAuthenticated}
              showDelete={showDelete}
              onExport={handleExportTxt}
              onTransfer={onTransferNote ? handleTransferNote : undefined}
              onManualSave={handleManualSave}
              onDelete={onDelete}
            />
          </>
        )}
      </div>

      {/* Modals */}
      {showPageEstimateModal && (
        <PageEstimateModal
          isOpen={showPageEstimateModal}
          currentFormat={currentPageFormat}
          onFormatChange={handlePageFormatChange}
          onClose={() => setShowPageEstimateModal(false)}
        />
      )}
      {showWordCountGoalModal && (
        <WordCountGoalModal
          isOpen={showWordCountGoalModal}
          currentGoal={wordCountGoal || { target: 0, type: "" }}
          onGoalChange={handleWordCountGoalChange}
          onClose={() => setShowWordCountGoalModal(false)}
          currentWordCount={wordCount}
          currentCharCount={charCount}
        />
      )}
    </section>
  );
}
