import React, { useState, useEffect, useRef, useCallback } from "react";

import type { CombinedNote } from "@/types/notes";
import TextBlock from "@/components/text-block";

import {
  IconFileTypeTxt,
  IconPencil,
  IconCheck,
  IconX,
  IconDeviceFloppy,
  IconCircleCheck,
  IconCircleX,
  IconLoader,
  IconPin,
  IconPinnedFilled,
  IconArrowUp,
  IconArrowDown,
  IconEye,
  IconEyeClosed,
  IconLock,
  IconLockOpen,
  IconCloud,
  IconCloudUpload,
  IconDeviceDesktopDown,
  IconDeviceDesktop,
  IconArrowsMaximize,
} from "@tabler/icons-react";

import {
  updateNoteAction,
  updateNoteTitleAction,
} from "@/app/actions/redisActions";

import type { NoteSource } from "@/types/combined-notes";
import {
  updateNote as updateSupabaseNote,
  updateNoteTitle as updateSupabaseNoteTitle,
} from "@/app/actions/supabaseActions";

import DeleteButton from "@/components/delete-button";
import ShareNoteButton from "@/components/share-note-button";
import PageEstimateModal from "@/components/page-estimate-modal";
import WordCountGoalModal from "@/components/word-count-goal-modal";
import { useAutoSave } from "@/components/hooks/use-auto-save";

let globalTimers = new Map<string, NodeJS.Timeout>();

interface TopWordCount {
  word: string;
  count: number;
}

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
  setActiveNote,
  openDistractionFreeNote,
  distractionFreeMode = false,
}: NoteBlockProps) {
  // States
  const [noteTitle, setNoteTitle] = useState(details.title);
  const [noteContent, setNoteContent] = useState(details.content);
  const [editingTitle, setEditingTitle] = useState(false);
  const [isPinned, setIsPinned] = useState(details.isPinned || false);
  const [isPinUpdating, setIsPinUpdating] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  const [transferComplete, setTransferComplete] = useState(false);

  const [isContentVisible, setIsContentVisible] = useState(true);
  const [isContentExpanded, setIsContentExpanded] = useState(true);
  const [isCollapsedUpdating, setIsCollapsedUpdating] = useState(false);

  const [isPrivate, setIsPrivate] = useState(details.isPrivate || false);
  const [isPrivacyUpdating, setIsPrivacyUpdating] = useState(false);

  // Basic statistics
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  // New statistics
  const [readingTime, setReadingTime] = useState<string>("0 min");
  const [topWords, setTopWords] = useState<TopWordCount[]>([]);
  const [pageEstimate, setPageEstimate] = useState<string>("0 pages");
  const [currentPageFormat, setCurrentPageFormat] = useState<string>("novel"); // Default page format
  const [showPageEstimateModal, setShowPageEstimateModal] = useState(false);

  // Word count goal tracking
  const [wordCountGoal, setWordCountGoal] = useState<WordCountGoal | null>(
    () => {
      // If we have a valid goal and goal type
      if (
        details.goal &&
        details.goal_type &&
        (details.goal_type === "words" || details.goal_type === "characters")
      ) {
        return {
          target: details.goal || 0,
          type: details.goal_type as "" | "words" | "characters",
        };
      }
      // Otherwise return null
      return null;
    },
  );
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [showWordCountGoalModal, setShowWordCountGoalModal] = useState(false);

  const [saveStatus, setSaveStatus] = useState("");
  const [saveIcon, setSaveIcon] = useState<React.ReactNode | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Refs
  const containerRef = useRef<HTMLElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef(details.content);
  const themeColorRef = useRef("bg-neutral-300");
  const statusMessageIdRef = useRef<number>(0);
  const reorderOperationRef = useRef<{ id: string; timestamp: number } | null>(
    null,
  );

  const saveCounterRef = useRef(0);
  const pendingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const timerKey = useRef(`note-timer-${details.id}`).current;

  const wordCountGoalRef = useRef(wordCountGoal);
  const prevIsTransferring = useRef(false);

  const collapseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const collapseSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate reading time based on word count
  const calculateReadingTime = (words: number) => {
    // Average reading speed (words per minute)
    const wpm = 225;
    const minutes = Math.ceil(words / wpm);

    if (minutes < 1) {
      return "< 1 min";
    } else if (minutes === 1) {
      return "1 min";
    } else {
      return `${minutes} mins`;
    }
  };

  // Calculate page estimates based on word count and format
  const calculatePageEstimate = (words: number, format: string = "novel") => {
    let wordsPerPage: number;

    switch (format) {
      case "novel":
        wordsPerPage = 250; // Standard for novels
        break;
      case "a4":
        wordsPerPage = 500; // Double-spaced A4 page
        break;
      case "a5":
        wordsPerPage = 300; // Typical for A5 format
        break;
      default:
        wordsPerPage = 250;
    }

    const pages = words / wordsPerPage;

    if (pages < 0.1) {
      return "1 page";
    } else if (pages < 1) {
      return "1 page";
    } else {
      return `${Math.ceil(pages)} pages`;
    }
  };

  // Calculate top 10 used words
  const calculateTopWords = (text: string): TopWordCount[] => {
    // Create a temporary DOM element to parse HTML safely
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = text;

    // Get text content which removes all HTML tags
    const plainText = tempDiv.textContent || tempDiv.innerText || "";

    // Normalize text and convert to lowercase
    const normalizedText = plainText.toLowerCase().replace(/[^\w\s]/g, "");

    // Split by whitespace and filter out empty strings
    const allWords = normalizedText.split(/\s+/).filter(Boolean);

    // Common words to exclude (stop words)
    const stopWords = new Set([
      "the",
      "and",
      "a",
      "an",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "as",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "but",
      "or",
      "if",
      "then",
      "else",
      "so",
      "this",
      "that",
      "these",
      "those",
      "it",
      "its",
      "i",
      "you",
      "he",
      "she",
      "we",
      "they",
      "me",
      "him",
      "her",
      "us",
      "them",
      "my",
      "your",
      "his",
      "our",
      "their",
      "what",
      "which",
      "who",
      "whom",
      "whose",
      "when",
      "where",
      "why",
      "how",
      "all",
      "any",
      "both",
      "each",
      "few",
      "more",
      "most",
      "some",
      "such",
      "no",
      "nor",
      "not",
      "only",
      "own",
      "same",
      "than",
      "too",
      "very",
      "can",
      "will",
      "just",
      "should",
      "now",
    ]);

    // Count word frequencies, excluding stop words
    const wordCounts: Record<string, number> = {};
    for (const word of allWords) {
      if (word.length > 1 && !stopWords.has(word)) {
        if (wordCounts[word]) {
          wordCounts[word]++;
        } else {
          wordCounts[word] = 1;
        }
      }
    }

    // Convert to array and sort by count
    const sortedWords = Object.entries(wordCounts)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Take top 10

    return sortedWords;
  };

  // Calculate progress percentage
  const calculateProgressPercentage = () => {
    if (!wordCountGoal) return 0;

    const currentValue = wordCountGoal.type === "words" ? wordCount : charCount;
    const percentage = Math.min(
      100,
      Math.round((currentValue / wordCountGoal.target) * 100),
    );

    return percentage;
  };

  // Handle page format change
  const handlePageFormatChange = (format: string) => {
    setCurrentPageFormat(format);
    setPageEstimate(calculatePageEstimate(wordCount, format));
    setShowPageEstimateModal(false);
  };

  // Handle word count goal change
  const handleWordCountGoalChange = (goal: WordCountGoal | null) => {
    setWordCountGoal(goal);
    setShowWordCountGoalModal(false);

    // Add status feedback for goal setting
    if (goal) {
      setStatusWithTimeout(
        "Saving goal...",
        <IconLoader className="animate-spin" />,
        false,
        10000,
      );

      // After a short delay to allow background save to complete
      setTimeout(() => {
        setStatusWithTimeout(
          "Goal saved",
          <IconCircleCheck className="text-mercedes-primary" />,
          false,
          2000,
        );
      }, 2000);
    } else {
      setStatusWithTimeout(
        "Goal cleared",
        <IconCircleCheck className="text-mercedes-primary" />,
        false,
        2000,
      );
    }

    if (goal) {
      const percentage = calculateProgressPercentage();
      setProgressPercentage(percentage);
    } else {
      setProgressPercentage(0);
    }
  };

  // Functions
  const getActiveEditorContent = useCallback((): string => {
    // Return the current noteContent state which should be the most recent
    return noteContent;
  }, [noteContent]);

  // Updated updateStats function that preserves empty lines
  const updateStats = useCallback(
    (text: string) => {
      // Create a temporary DOM element to parse HTML safely
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = text;

      // Get text content which removes all HTML tags and preserves proper spacing
      const plainText = tempDiv.textContent || tempDiv.innerText || "";

      // For word counting, preserve line breaks but normalize multiple spaces
      // This regex only replaces multiple spaces (not newlines) with single space
      const normalizedText = plainText
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .trim();

      // Count words (split by whitespace including newlines and filter out empty strings)
      const words = normalizedText
        ? normalizedText.split(/\s+/).filter(Boolean)
        : [];

      // Set word count
      setWordCount(words.length);

      // For character count, count all characters including whitespace
      const isEmpty = plainText.replace(/\s/g, "").length === 0;
      setCharCount(isEmpty ? 0 : plainText.length);

      // Update reading time
      setReadingTime(calculateReadingTime(words.length));

      // Update page estimate
      setPageEstimate(calculatePageEstimate(words.length, currentPageFormat));

      // Update top words (only if the content has a reasonable length)
      if (words.length > 20) {
        setTopWords(calculateTopWords(plainText));
      } else {
        setTopWords([]);
      }
    },
    [currentPageFormat],
  );

  // Toggle visibility of note content
  const toggleContentVisibility = () => {
    const newCollapsedState = isContentExpanded;

    if (isContentExpanded) {
      // Collapsing the note
      setIsContentExpanded(false);

      collapseTimeoutRef.current = setTimeout(() => {
        setIsContentVisible(false);
      }, 300);
    } else {
      // Expanding the note
      setIsContentVisible(true);

      // Use requestAnimationFrame to ensure DOM is updated before animation begins
      requestAnimationFrame(() => {
        setIsContentExpanded(true);
      });
    }

    // Use a debounce to avoid too many server calls during rapid toggling
    if (collapseSaveTimeoutRef.current) {
      clearTimeout(collapseSaveTimeoutRef.current);
    }

    collapseSaveTimeoutRef.current = setTimeout(() => {
      saveCollapsedState(newCollapsedState);
    }, 300);
  };

  // Function to save collapsed state to the server
  const saveCollapsedState = (isCollapsed: boolean) => {
    setIsCollapsedUpdating(true);

    try {
      // Use the callback provided by parent component
      if (onCollapsedStatusChange) {
        // Call the callback but don't assume it returns a Promise
        onCollapsedStatusChange(details.id, isCollapsed);

        // Since we can't wait for completion, just set loading to false after a reasonable delay
        setTimeout(() => {
          setIsCollapsedUpdating(false);
        }, 500);
      } else {
        console.error("No onCollapsedStatusChange callback provided");
        setIsCollapsedUpdating(false);
      }
    } catch (error) {
      console.error("Error in saveCollapsedState:", error);
      setIsCollapsedUpdating(false);
    }
  };

  // Clear status timeout helper function
  const clearStatusTimeout = () => {
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = null;
    }
  };

  // Set status with auto-clear after delay - now with race condition prevention
  const setStatusWithTimeout = (
    message: string,
    icon: React.ReactNode,
    isError = false,
    delay = 2000,
  ) => {
    clearStatusTimeout();

    // Generate a unique ID for this status message
    const messageId = Date.now();
    statusMessageIdRef.current = messageId;

    setSaveStatus(message);
    setSaveIcon(icon);

    statusTimeoutRef.current = setTimeout(() => {
      // Only clear if this is still the active message
      if (statusMessageIdRef.current === messageId) {
        setSaveStatus("");
        setSaveIcon(null);
      }
    }, delay);
  };

  // Determine if Up/Down buttons should be disabled
  const canMoveUp = (): boolean => {
    if (isPinned) {
      return !isFirstPinned;
    } else {
      return !isFirstUnpinned;
    }
  };

  const canMoveDown = (): boolean => {
    if (isPinned) {
      return !isLastPinned;
    } else {
      return !isLastUnpinned;
    }
  };

  // Handle moving notes up or down - now with race condition prevention
  const handleMoveNote = (direction: "up" | "down") => {
    if (isReordering) return;

    flushAutoSave();

    // Start with loading state
    setIsReordering(true);

    // Generate a unique operation ID
    const operationId = `${details.id}-${Date.now()}`;
    const operationTimestamp = Date.now();

    // Store the current operation details
    reorderOperationRef.current = {
      id: operationId,
      timestamp: operationTimestamp,
    };

    // Show loading status immediately
    setStatusWithTimeout(
      direction === "up" ? "Moving up..." : "Moving down...",
      <IconLoader className="animate-spin" />,
      false,
      10000,
    );

    try {
      if (onReorder) {
        // Add a small delay before calling onReorder
        setTimeout(() => {
          // Call the onReorder callback
          onReorder(details.id, direction);

          // Show success status after a reasonable delay
          setTimeout(() => {
            if (reorderOperationRef.current?.id === operationId) {
              const messageId = Date.now();
              statusMessageIdRef.current = messageId;

              clearStatusTimeout();
              setSaveStatus("");
              setSaveIcon(null);

              setTimeout(() => {
                if (statusMessageIdRef.current === messageId) {
                  setStatusWithTimeout(
                    direction === "up" ? "Moved up" : "Moved down",
                    <IconCircleCheck className="text-mercedes-primary" />,
                    false,
                    2000,
                  );
                }
              }, 50);

              setIsReordering(false);
              reorderOperationRef.current = null;
            }
          }, 800);
        }, 300);
      } else {
        // No callback provided
        setTimeout(() => {
          setStatusWithTimeout(
            `Cannot move ${direction}`,
            <IconCircleX className="text-red-700" />,
            true,
            3000,
          );
          console.error("No onReorder callback provided");

          setIsReordering(false);
          reorderOperationRef.current = null;
        }, 500);
      }
    } catch (error) {
      setTimeout(() => {
        if (reorderOperationRef.current?.id === operationId) {
          setStatusWithTimeout(
            `Error moving ${direction}`,
            <IconCircleX className="text-red-700" />,
            true,
            3000,
          );
          console.error(`Error moving note ${direction}:`, error);

          setIsReordering(false);
          reorderOperationRef.current = null;
        }
      }, 500);
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

      // Don't save if content hasn't changed (unless manual)
      if (safeContent === lastSavedContentRef.current && !isManual) {
        return;
      }

      const saveId = ++saveCounterRef.current;
      console.log(`🔵 Starting save #${saveId} (manual: ${isManual})`);

      setStatusWithTimeout(
        "Saving...",
        <IconLoader className="animate-spin" />,
        false,
        10000,
      );
      setIsPending(true);

      const startTime = Date.now();

      try {
        let result;
        if (noteSource === "redis") {
          result = await updateNoteAction(
            userId,
            details.id,
            safeContent,
            wordCountGoalRef.current?.target || 0,
            wordCountGoalRef.current?.type || "",
          );
        } else {
          result = await updateSupabaseNote(
            details.id,
            safeContent,
            wordCountGoalRef.current?.target || 0,
            wordCountGoalRef.current?.type || "",
          );
        }

        // Minimum delay to show "Saving..." feedback
        const elapsed = Date.now() - startTime;
        const remainingDelay = Math.max(0, 1000 - elapsed);

        if (remainingDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, remainingDelay));
        }

        if (result.success) {
          lastSavedContentRef.current = safeContent;
          console.log(`✅ Save #${saveId} completed successfully`);

          setStatusWithTimeout(
            "Saved",
            <IconCircleCheck className="text-mercedes-primary" />,
            false,
            2000,
          );
        } else {
          console.log(`❌ Save #${saveId} failed:`, result.error);
          setStatusWithTimeout(
            "Failed to save",
            <IconCircleX className="text-red-700" />,
            true,
            3000,
          );
        }
      } catch (error) {
        console.log(`❌ Save #${saveId} error:`, error);
        setStatusWithTimeout(
          "Error saving",
          <IconCircleX className="text-red-700" />,
          true,
          3000,
        );
      } finally {
        setIsPending(false);
      }
    },
    [userId, details.id, noteSource],
  );

  const { debouncedSave, flushSave, cancelSave } = useAutoSave(
    noteContent,
    saveContent,
    2000,
  );

  const debouncedAutoSave = useCallback((content: string) => {
    // Clear any existing timeout
    if (pendingTimeoutRef.current) {
      console.log("🟡 Cancelling previous save timer");
      clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }

    // Set a new timeout
    console.log("⏱️ Starting new 2-second save timer");
    pendingTimeoutRef.current = setTimeout(() => {
      console.log("⏰ 2-second timer completed - initiating auto-save");
      pendingTimeoutRef.current = null;
      saveContentRef.current?.(content, false);
    }, 2000);
  }, []);

  const flushAutoSave = useCallback(() => {
    if (pendingTimeoutRef.current) {
      console.log("🚀 Flushing pending auto-save");
      clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
      // Get the current content and save it immediately
      const currentContent = noteContent;
      saveContentRef.current?.(currentContent, false);
    }
  }, [noteContent]);

  const cancelAutoSave = useCallback(() => {
    if (pendingTimeoutRef.current) {
      console.log("🛑 Cancelling pending auto-save");
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
      console.log(`📝 Content changed (length: ${value.length})`);

      // Update local state first for responsive UI
      setNoteContent(value);

      // Update stats with preserved empty lines
      updateStats(value);

      // Trigger auto-save
      debouncedSave();
    },
    [updateStats, debouncedSave],
  );

  // Manual save function
  // Manual save function
  const handleManualSave = useCallback(async () => {
    await saveContent(noteContent, true);
  }, [saveContent, noteContent]);

  // Pin/Unpin functionality
  const handleTogglePin = async () => {
    const newPinStatus = !isPinned;

    // Start with loading state BEFORE changing visual state
    setIsPinUpdating(true);

    // Show loading status immediately
    setStatusWithTimeout(
      newPinStatus ? "Pinning..." : "Unpinning...",
      <IconLoader className="animate-spin" />,
      false,
      10000,
    );

    // Short delay before applying optimistic UI update
    setTimeout(() => {
      setIsPinned(newPinStatus);
    }, 300);

    try {
      if (onPinStatusChange) {
        // Call the callback but don't assume it returns a Promise
        onPinStatusChange(details.id, newPinStatus);

        // Since we can't await completion, show success after a reasonable delay
        setTimeout(() => {
          const messageId = Date.now();
          statusMessageIdRef.current = messageId;

          clearStatusTimeout();
          setSaveStatus("");
          setSaveIcon(null);

          setTimeout(() => {
            if (statusMessageIdRef.current === messageId) {
              setStatusWithTimeout(
                newPinStatus ? "Pinned" : "Unpinned",
                <IconCircleCheck className="text-mercedes-primary" />,
                false,
                2000,
              );
            }
          }, 50);

          setIsPinUpdating(false);
        }, 800);
      } else {
        // No callback provided
        setTimeout(() => {
          setIsPinned(!newPinStatus); // Revert optimistic update
          setStatusWithTimeout(
            `Cannot ${newPinStatus ? "pin" : "unpin"} note`,
            <IconCircleX className="text-red-700" />,
            true,
            3000,
          );
          console.error("No onPinStatusChange callback provided");
          setIsPinUpdating(false);
        }, 500);
      }
    } catch (error) {
      // Error occurred
      setTimeout(() => {
        setIsPinned(!newPinStatus); // Revert optimistic update
        setStatusWithTimeout(
          `Error ${newPinStatus ? "pinning" : "unpinning"}`,
          <IconCircleX className="text-red-700" />,
          true,
          3000,
        );
        console.error(
          `Error ${newPinStatus ? "pinning" : "unpinning"} note:`,
          error,
        );
        setIsPinUpdating(false);
      }, 500);
    }
  };

  const handleEditTitle = () => {
    setEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    if (noteTitle.trim() === "") {
      setNoteTitle(details.title); // Reset to original if empty
      setEditingTitle(false);
      return;
    }

    setEditingTitle(false);
    setStatusWithTimeout(
      "Saving title...",
      <IconLoader className="animate-spin" />,
      false,
      10000,
    );

    try {
      let result;

      // Use the appropriate action based on note source
      if (noteSource === "redis") {
        result = await updateNoteTitleAction(userId, details.id, noteTitle);
      } else {
        // For Supabase notes
        result = await updateSupabaseNoteTitle(details.id, noteTitle);
      }

      if (result.success) {
        setStatusWithTimeout(
          "Title saved",
          <IconCircleCheck className="text-mercedes-primary" />,
          false,
          2000,
        );
      } else {
        setStatusWithTimeout(
          "Title save failed",
          <IconCircleX className="text-red-700" />,
          true,
          3000,
        );
        console.error("Failed to save title:", result.error);
      }
    } catch (error) {
      console.error("Error updating note title:", error);
      setStatusWithTimeout(
        "Title save failed",
        <IconCircleX className="text-red-700" />,
        true,
        3000,
      );
    }
  };

  const handleCancelEditTitle = () => {
    setNoteTitle(details.title); // Reset to original
    setEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSaveTitle();
    } else if (e.key === "Escape") {
      handleCancelEditTitle();
    }
  };

  const handleExportTxt = () => {
    // Create a temporary DOM element to parse HTML safely
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = noteContent;

    // Get text content which removes all HTML tags
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

  const handleTogglePrivacy = () => {
    const newPrivacyStatus = !isPrivate;

    flushAutoSave();

    // Start with loading state
    setIsPrivacyUpdating(true);

    // Show loading status immediately
    setStatusWithTimeout(
      newPrivacyStatus ? "Setting to private..." : "Setting to public...",
      <IconLoader className="animate-spin" />,
      false,
      10000,
    );

    // Short delay before applying optimistic UI update
    setTimeout(() => {
      setIsPrivate(newPrivacyStatus);
    }, 300);

    try {
      if (onPrivacyStatusChange) {
        // Call the callback but don't assume it returns a Promise
        onPrivacyStatusChange(details.id, newPrivacyStatus);

        // Since we can't wait for completion, show success after a reasonable delay
        setTimeout(() => {
          const messageId = Date.now();
          statusMessageIdRef.current = messageId;

          clearStatusTimeout();
          setSaveStatus("");
          setSaveIcon(null);

          setTimeout(() => {
            if (statusMessageIdRef.current === messageId) {
              setStatusWithTimeout(
                newPrivacyStatus ? "Set to private" : "Set to public",
                <IconCircleCheck className="text-mercedes-primary" />,
                false,
                2000,
              );
            }
          }, 50);

          setIsPrivacyUpdating(false);
        }, 800);
      } else {
        // No callback provided
        setTimeout(() => {
          setIsPrivate(!newPrivacyStatus); // Revert optimistic update
          setStatusWithTimeout(
            `Cannot set ${newPrivacyStatus ? "private" : "public"}`,
            <IconCircleX className="text-red-700" />,
            true,
            3000,
          );
          console.error("No onPrivacyStatusChange callback provided");
          setIsPrivacyUpdating(false);
        }, 500);
      }
    } catch (error) {
      setTimeout(() => {
        setIsPrivate(!newPrivacyStatus); // Revert optimistic update
        setStatusWithTimeout(
          `Error occurred`,
          <IconCircleX className="text-red-700" />,
          true,
          3000,
        );
        console.error("Unexpected error:", error);
        setIsPrivacyUpdating(false);
      }, 500);
    }
  };

  const handleTransferNote = async (targetSource: NoteSource) => {
    if (!onTransferNote) {
      setStatusWithTimeout(
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

      // Step 1: Save current content if it has changed
      const currentContent = getActiveEditorContent();

      if (currentContent !== lastSavedContentRef.current) {
        setStatusWithTimeout(
          "Saving latest changes...",
          <IconLoader className="animate-spin" />,
          false,
          5000,
        );

        await saveContent(currentContent, true);

        // Wait for save to complete
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Step 2: Transfer with fresh data
      setStatusWithTimeout(
        "Transferring...",
        <IconLoader className="animate-spin" />,
        false,
        10000,
      );

      await onTransferNote(details.id, targetSource);

      setStatusWithTimeout(
        "Transfer complete!",
        <IconCircleCheck className="text-mercedes-primary" />,
        false,
        2000,
      );
    } catch (error) {
      console.error("Transfer error:", error);
      setStatusWithTimeout(
        "Transfer failed",
        <IconCircleX className="text-red-700" />,
        true,
        3000,
      );
    }
  };

  // Effects
  // IMPORTANT: Only run this effect once on mount, not on every render
  useEffect(() => {
    setNoteContent(details.content);
    setNoteTitle(details.title);
    lastSavedContentRef.current = details.content;

    // Set initial pin status from the details
    setIsPinned(details.isPinned || false);
    setIsPrivate(details.isPrivate || false);
    setIsContentExpanded(!(details.isCollapsed || false));
    setIsContentVisible(!(details.isCollapsed || false));

    if (details.goal || details.goal_type) {
      setWordCountGoal({
        target: details.goal || 0,
        type:
          details.goal_type === "words" || details.goal_type === "characters"
            ? details.goal_type
            : "",
      });
    }

    // Update stats with the more robust HTML stripping method
    updateStats(details.content);

    return () => {
      console.log("🧹 Component unmounting - cleaning up timers");
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
      }
      flushAutoSave();
      clearStatusTimeout();
      cancelAutoSave(); // This now calls our new cancelAutoSave
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
      }
      if (collapseSaveTimeoutRef.current) {
        clearTimeout(collapseSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setNoteTitle(details.title);

    return () => {
      clearStatusTimeout();
    };
  }, [details.title]);

  // Update pin status if the details change
  useEffect(() => {
    setIsPinned(details.isPinned || false);
  }, [details.isPinned]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [editingTitle]);

  // Add an effect to handle completion animation
  useEffect(() => {
    if (isTransferring) {
      // When transfer starts
      setTransferComplete(false);
    } else if (transferComplete) {
      // Reset after animation completes
      const timeout = setTimeout(() => {
        setTransferComplete(false);
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [isTransferring, transferComplete]);

  // When isTransferring changes from true to false
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

  if (isDeleting) {
    return (
      <section className={`col-span-12 flex items-center gap-2`}>
        <div
          className={`flex-grow h-0.5 bg-neutral-300 transition-all duration-300 ease-in-out`}
        ></div>

        <div className="text-sm text-neutral-500 italic animate-pulse">
          Deleting...
        </div>
      </section>
    );
  }

  useEffect(() => {
    return () => {
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (details.isCollapsed !== undefined) {
      setIsContentExpanded(!details.isCollapsed);
      setIsContentVisible(!details.isCollapsed);
    }
  }, [details.isCollapsed]);

  useEffect(() => {
    if (wordCountGoal && wordCountGoal.target > 0) {
      if (wordCountGoal.type === "words") {
        setProgressPercentage(
          Math.min(100, Math.round((wordCount / wordCountGoal.target) * 100)),
        );
      } else {
        setProgressPercentage(
          Math.min(100, Math.round((charCount / wordCountGoal.target) * 100)),
        );
      }
    }
  }, [wordCountGoal, wordCount, charCount]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isPending) {
        flushAutoSave();
        // Most browsers will show a generic message
        e.preventDefault();
        e.returnValue = "";
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
      <article className={`flex flex-col md:flex-row gap-2 md:items-center`}>
        <div
          className={`group flex gap-2 items-center justify-between md:justify-start min-h-6 font-semibold uppercase`}
        >
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                ref={titleInputRef}
                type="text"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                className={`px-2 py-1 border ${
                  isPrivate ? "border-violet-800" : "border-mercedes-primary"
                } focus:outline-none rounded bg-white text-neutral-800 font-semibold`}
                maxLength={50}
              />
              <div className="flex items-center">
                <button
                  onClick={handleSaveTitle}
                  className={`p-1 cursor-pointer rounded-full ${
                    isPrivate ? "text-violet-800" : "text-mercedes-primary"
                  } opacity-50 hover:opacity-100 transition-all duration-300 ease-in-out`}
                >
                  <IconCheck size={18} strokeWidth={2} />
                </button>
                <button
                  onClick={handleCancelEditTitle}
                  className={`p-1 cursor-pointer rounded-full text-red-700 opacity-50 hover:opacity-100 transition-all duration-300 ease-in-out`}
                >
                  <IconX size={18} strokeWidth={2} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <article className={`flex-grow flex items-center gap-1`}>
                <span
                  className={`flex items-center gap-1 min-w-fit max-w-[90%]`}
                >
                  {isPrivate && (
                    <IconLock
                      size={16}
                      strokeWidth={2}
                      className="text-neutral-500"
                      title="Private note"
                    />
                  )}
                  {noteTitle}
                </span>
                <div
                  className={`w-fit max-w-0 group-hover:max-w-[999px] overflow-hidden transition-all duration-500 ease-in-out cursor-pointer`}
                  onClick={handleEditTitle}
                >
                  <IconPencil
                    className={`opacity-50 hover:opacity-100 text-neutral-500 ${
                      isPrivate
                        ? "hover:text-violet-800"
                        : "hover:text-mercedes-primary"
                    } transition-all duration-300 ease-in-out`}
                    size={20}
                    strokeWidth={2}
                  />
                </div>
              </article>
              {saveStatus && (
                <div
                  className={`flex md:hidden items-center gap-1 text-xs text-neutral-500 italic`}
                >
                  {saveIcon}
                  <span
                    className={
                      saveStatus === "Saved" ||
                      saveStatus === "Pinned" ||
                      saveStatus === "Unpinned" ||
                      saveStatus === "Title saved" ||
                      saveStatus === "Moved up" ||
                      saveStatus === "Moved down" ||
                      saveStatus === "Goal saved"
                        ? isPrivate
                          ? "text-violet-800"
                          : "text-mercedes-primary"
                        : saveStatus.includes("fail") ||
                            saveStatus.includes("Error")
                          ? "text-red-700"
                          : ""
                    }
                  >
                    {saveStatus}
                  </span>
                </div>
              )}

              <span className={`flex items-center gap-1 ml-2`}>
                {noteSource === "supabase" ? (
                  <span
                    className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 border border-blue-300`}
                  >
                    <IconCloud size={20} /> CLOUD
                  </span>
                ) : (
                  <span
                    className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 border border-orange-300`}
                  >
                    <IconDeviceDesktop size={20} /> LOCAL
                  </span>
                )}
              </span>
            </>
          )}
        </div>

        <div
          className={`flex-grow h-0.5 ${
            isPrivate
              ? "bg-violet-800"
              : isPinned
                ? "bg-mercedes-primary"
                : "bg-neutral-300"
          } transition-all duration-300 ease-in-out`}
        ></div>

        {saveStatus && (
          <div
            className={`hidden md:flex items-center gap-1 text-xs text-neutral-500 italic`}
          >
            {saveIcon}
            <span
              className={
                saveStatus === "Saved" ||
                saveStatus === "Pinned" ||
                saveStatus === "Unpinned" ||
                saveStatus === "Title saved" ||
                saveStatus === "Moved up" ||
                saveStatus === "Moved down" ||
                saveStatus === "Goal saved"
                  ? isPrivate
                    ? "text-violet-800"
                    : "text-mercedes-primary"
                  : saveStatus.includes("fail") || saveStatus.includes("Error")
                    ? "text-red-700"
                    : ""
              }
            >
              {saveStatus}
            </span>
          </div>
        )}

        {!distractionFreeMode && (
          <div className="flex justify-end items-center gap-1">
            <button
              type={`button`}
              onClick={toggleContentVisibility}
              className={`p-1 cursor-pointer rounded-lg border border-neutral-300 hover:bg-neutral-100 opacity-60 hover:opacity-100 transition-all duration-300 ease-in-out`}
              title={
                isContentVisible ? "Hide note content" : "Show note content"
              }
            >
              {isContentVisible ? (
                <IconEye size={18} strokeWidth={1.5} />
              ) : (
                <IconEyeClosed size={18} strokeWidth={1.5} />
              )}
            </button>
            {openDistractionFreeNote && (
              <button
                type={`button`}
                onClick={openDistractionFreeNote}
                className={`p-1 cursor-pointer rounded-lg border border-neutral-300 hover:bg-neutral-100 opacity-60 hover:opacity-100 transition-all duration-300 ease-in-out`}
                title={"Open Distraction-Free Mode"}
              >
                <IconArrowsMaximize size={18} strokeWidth={1.5} />
              </button>
            )}

            <button
              type="button"
              onClick={() => handleMoveNote("up")}
              disabled={!canMoveUp() || isReordering}
              className={`p-1 cursor-pointer rounded-lg border border-neutral-300 ${
                !canMoveUp() || isReordering
                  ? "opacity-30 cursor-not-allowed"
                  : "hover:bg-neutral-100 opacity-60 hover:opacity-100"
              } transition-all duration-300 ease-in-out`}
              title="Move note up"
            >
              <IconArrowUp size={18} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => handleMoveNote("down")}
              disabled={!canMoveDown() || isReordering}
              className={`p-1 cursor-pointer rounded-lg border border-neutral-300 ${
                !canMoveDown() || isReordering
                  ? "opacity-30 cursor-not-allowed"
                  : "hover:bg-neutral-100 opacity-60 hover:opacity-100"
              } transition-all duration-300 ease-in-out`}
              title="Move note down"
            >
              <IconArrowDown size={18} strokeWidth={1.5} />
            </button>
            <article className={`flex justify-end gap-2 w-full`}>
              {/* Pin button - show either pinned or unpinned based on state */}
              <button
                onClick={handleTogglePin}
                disabled={isPinUpdating}
                className={`p-1 border ${
                  isPinned
                    ? `text-neutral-100 hover:text-neutral-100 ${
                        isPrivate
                          ? "border-violet-800 hover:border-violet-800 bg-violet-800 hover:bg-violet-600"
                          : "border-mercedes-primary hover:border-mercedes-primary/60 bg-mercedes-primary" +
                            " hover:bg-mercedes-primary/70"
                      }`
                    : "border-neutral-400 text-neutral-500 hover:bg-neutral-50"
                } rounded-lg transition-all duration-300 ease-in-out ${
                  isPinUpdating
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
                }`}
                title={isPinned ? "Unpin this note" : "Pin this note"}
              >
                {isPinned ? (
                  <IconPinnedFilled size={18} strokeWidth={2} />
                ) : (
                  <IconPin size={18} strokeWidth={2} />
                )}
              </button>

              {/* Privacy toggle button */}
              <button
                onClick={handleTogglePrivacy}
                disabled={isPrivacyUpdating}
                className={`p-1 border rounded-lg transition-all duration-300 ease-in-out ${
                  isPrivacyUpdating
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
                } ${
                  isPrivate
                    ? "border-violet-800 hover:border-violet-600 bg-violet-800 hover:bg-violet-600" +
                      " text-neutral-100" // Private state
                    : "border-neutral-400 hover:bg-neutral-200 text-neutral-500" // Public state
                }`}
                title={
                  isPrivate ? "Make this note public" : "Make this note private"
                }
              >
                {isPrivate ? (
                  <IconLock size={18} strokeWidth={2} />
                ) : (
                  <IconLockOpen size={18} strokeWidth={2} />
                )}
              </button>
            </article>
          </div>
        )}
      </article>

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
              <div
                className={`col-span-12 ${
                  distractionFreeMode
                    ? ""
                    : "sm:col-span-8 md:col-span-9 3xl:col-span-10"
                } rounded-xl overflow-hidden`}
              >
                <TextBlock
                  value={noteContent}
                  onChange={handleChange}
                  distractionFreeMode={distractionFreeMode}
                  placeholder="Just start typing..."
                />
              </div>

              {!distractionFreeMode && (
                <div
                  className={`p-4 col-span-12 sm:col-span-4 md:col-span-3 3xl:col-span-2 grid grid-cols-4 sm:flex sm:flex-col justify-start gap-2 bg-neutral-300 rounded-xl text-sm xs:text-lg sm:text-xl text-neutral-500/70 font-light capitalize`}
                >
                  {/* Word Count */}
                  <p
                    className={`col-span-4 xs:col-span-1 flex xs:flex-col xl:flex-row items-center justify-center gap-1 sm:gap-1 xs:gap-0 rounded-xl border border-neutral-400 text-base`}
                  >
                    <span
                      className={`${
                        isPrivate ? "text-violet-800" : "text-mercedes-primary"
                      } text-lg xs:text-xl font-medium`}
                    >
                      {wordCount}
                    </span>
                    <span>words</span>
                  </p>

                  {/* Character Count */}
                  <p
                    className={`col-span-4 xs:col-span-1 flex xs:flex-col xl:flex-row items-center justify-center gap-1 sm:gap-1 xs:gap-0 rounded-xl border border-neutral-400 text-base`}
                  >
                    <span
                      className={`${
                        isPrivate ? "text-violet-800" : "text-mercedes-primary"
                      } text-lg xs:text-xl font-medium`}
                    >
                      {charCount}
                    </span>
                    <span>characters</span>
                  </p>

                  {/* Reading Time */}
                  <p
                    className={`col-span-4 xs:col-span-1 flex xs:flex-col xl:flex-row items-center justify-center gap-1 sm:gap-1 xs:gap-0 rounded-xl border border-neutral-400 text-base`}
                  >
                    <span
                      className={`${
                        isPrivate ? "text-violet-800" : "text-mercedes-primary"
                      } text-lg font-medium`}
                    >
                      {readingTime}
                    </span>
                    <span>read time</span>
                  </p>

                  {/* Page Estimate - clickable to open modal */}
                  <p
                    className={`cursor-pointer col-span-4 xs:col-span-1 flex xs:flex-col xl:flex-row items-center justify-center gap-1 sm:gap-1 xs:gap-0 rounded-xl border border-neutral-400 hover:bg-neutral-200 text-base transition-all duration-300 ease-in-out`}
                    onClick={() => setShowPageEstimateModal(true)}
                    title="Click to change page format"
                  >
                    <span
                      className={`flex items-center gap-1 ${
                        isPrivate ? "text-violet-800" : "text-mercedes-primary"
                      } text-lg font-medium`}
                    >
                      {pageEstimate}
                    </span>
                    <span>{currentPageFormat}</span>
                  </p>

                  {/* Word Count Goal - Progress Bar */}
                  <div
                    className="col-span-4 p-1 xs:p-2 rounded-xl border border-neutral-400 cursor-pointer hover:bg-neutral-200 transition-all duration-300 ease-in-out"
                    onClick={() => setShowWordCountGoalModal(true)}
                  >
                    {wordCountGoal &&
                    wordCountGoal.target > 0 &&
                    wordCountGoal.type !== "" ? (
                      <div className="flex flex-col items-center w-full">
                        <div className="w-full bg-neutral-50 rounded-full h-4 mb-1">
                          <div
                            className={`h-4 rounded-full ${
                              isPrivate
                                ? "bg-violet-600"
                                : "bg-mercedes-primary"
                            } transition-all duration-300 ease-in-out`}
                            style={{ width: `${progressPercentage}%` }}
                          ></div>
                        </div>
                        <div className="text-center text-sm">
                          {progressPercentage}% of {wordCountGoal.target}{" "}
                          {wordCountGoal.type === "words"
                            ? "words"
                            : "characters"}
                          {progressPercentage >= 100 && (
                            <span className="text-green-600 ml-1">
                              ✓ Completed!
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <span className="text-center text-base">
                          Set Word Goal
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Top Words */}
                  {/*{topWords.length > 0 && (*/}
                  {/*  <div className="col-span-3 p-2 rounded-xl border border-neutral-400">*/}
                  {/*    <h4 className="text-center text-sm font-medium mb-2">*/}
                  {/*      Top Words*/}
                  {/*    </h4>*/}
                  {/*    <div className="grid grid-cols-2 gap-1 text-sm">*/}
                  {/*      {topWords.slice(0, 10).map((wordObj, index) => (*/}
                  {/*        <div key={index} className="flex justify-between">*/}
                  {/*          <span>{wordObj.word}</span>*/}
                  {/*          <span*/}
                  {/*            className={`${*/}
                  {/*              isPrivate*/}
                  {/*                ? "text-violet-800"*/}
                  {/*                : "text-mercedes-primary"*/}
                  {/*            } font-medium`}*/}
                  {/*          >*/}
                  {/*            {wordObj.count}*/}
                  {/*          </span>*/}
                  {/*        </div>*/}
                  {/*      ))}*/}
                  {/*    </div>*/}
                  {/*  </div>*/}
                  {/*)}*/}
                </div>
              )}
            </article>

            {/* Actions */}
            <article
              className={`mt-3 flex gap-2 items-center justify-between sm:justify-start`}
            >
              <button
                type={`button`}
                onClick={handleExportTxt}
                title={`Export as text file`}
                className={`group/export px-2 cursor-pointer flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 w-fit min-w-10 h-10 rounded-lg border-1 ${
                  isPrivate
                    ? "border-violet-800 hover:bg-violet-800 hover:text-neutral-100"
                    : "border-neutral-500 hover:border-mercedes-primary hover:bg-mercedes-primary"
                } text-neutral-800 overflow-hidden transition-all duration-300 ease-in-out`}
              >
                <IconFileTypeTxt size={20} strokeWidth={2} />
                <span
                  className={`w-fit max-w-0 sm:group-hover/export:max-w-52 opacity-0 md:group-hover/export:opacity-100 overflow-hidden transition-all duration-300 ease-in-out`}
                >
                  Export as .txt File
                </span>
              </button>

              {isAuthenticated && (
                <>
                  {onTransferNote && noteSource && (
                    <button
                      type={`button`}
                      onClick={() =>
                        handleTransferNote(
                          noteSource === "redis" ? "supabase" : "redis",
                        )
                      }
                      title={
                        noteSource === "redis"
                          ? "Transfer to Cloud"
                          : "Transfer to Local"
                      }
                      className={`group/transfer px-2 cursor-pointer flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 w-fit min-w-10 h-10 rounded-lg border-1 ${
                        isPrivate
                          ? "border-violet-800 hover:bg-violet-800 hover:text-neutral-100"
                          : "border-neutral-500 hover:border-mercedes-primary hover:bg-mercedes-primary"
                      } text-neutral-800 overflow-hidden transition-all duration-300 ease-in-out`}
                    >
                      {noteSource === "redis" ? (
                        <div
                          className={`flex items-center gap-0 md:group-hover/transfer:gap-2 transition-all duration-400 ease-in-out`}
                        >
                          <IconCloudUpload size={20} strokeWidth={2} />
                          <span
                            className={`w-fit max-w-0 md:group-hover/transfer:max-w-52 opacity-0 md:group-hover/transfer:opacity-100 overflow-hidden transition-all duration-300 ease-in-out`}
                          >
                            Transfer to Cloud
                          </span>
                        </div>
                      ) : (
                        <div
                          className={`flex items-center gap-0 md:group-hover/transfer:gap-2 transition-all duration-400 ease-in-out`}
                        >
                          <IconDeviceDesktopDown size={20} strokeWidth={2} />
                          <span
                            className={`w-fit max-w-0 md:group-hover/transfer:max-w-52 opacity-0 md:group-hover/transfer:opacity-100 overflow-hidden transition-all duration-300 ease-in-out`}
                          >
                            Move to Local
                          </span>
                        </div>
                      )}
                    </button>
                  )}

                  <ShareNoteButton
                    noteId={details.id}
                    noteTitle={details.title}
                    noteSource={noteSource}
                    isPrivate={isPrivate}
                    isAuthenticated={isAuthenticated}
                    userId={userId}
                  />
                </>
              )}

              <div
                className={`hidden sm:block flex-grow h-0.5 ${
                  isPrivate
                    ? "bg-violet-800"
                    : isPinned
                      ? "bg-mercedes-primary"
                      : "bg-neutral-300"
                } transition-all duration-300 ease-in-out`}
              ></div>

              <button
                type={`button`}
                disabled={isPending}
                onClick={handleManualSave}
                title={`Save note manually`}
                className={`group/save flex-grow sm:flex-grow-0 px-2 cursor-pointer flex flex-row-reverse items-center justify-center gap-0 md:hover:gap-2 w-fit min-w-10 h-10 rounded-lg border sm:border-0 ${
                  isPrivate
                    ? "hover:bg-violet-800 hover:text-neutral-100"
                    : "border-neutral-500 hover:border-mercedes-primary hover:bg-mercedes-primary"
                } ${
                  isPending ? "opacity-50 cursor-not-allowed" : ""
                } text-neutral-800 overflow-hidden transition-all duration-300 ease-in-out`}
              >
                <IconDeviceFloppy size={20} strokeWidth={2} />
                <span
                  className={`w-fit max-w-0 md:group-hover/save:max-w-52 opacity-0 md:group-hover/save:opacity-100 overflow-hidden transition-all duration-300 ease-in-out`}
                >
                  Force Save Note
                </span>
              </button>

              {showDelete && (
                <DeleteButton
                  noteId={details.id}
                  noteTitle={details.title}
                  userId={userId}
                  noteSource={noteSource}
                  onDeleteSuccess={onDelete}
                />
              )}
            </article>
          </>
        )}
      </div>
      {/* Page Estimate Modal */}
      {showPageEstimateModal && (
        <PageEstimateModal
          currentFormat={currentPageFormat}
          onFormatChange={handlePageFormatChange}
          onClose={() => setShowPageEstimateModal(false)}
        />
      )}
      {/* Word Count Goal Modal */}
      {showWordCountGoalModal && (
        <WordCountGoalModal
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
