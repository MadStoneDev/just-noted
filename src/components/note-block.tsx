"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Note } from "@/types/notes";
import TextBlock from "@/components/text-block";

import {
  IconFileTypeTxt,
  IconPencil,
  IconTrash,
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
} from "@tabler/icons-react";

import {
  deleteNoteAction,
  updateNoteAction,
  updateNoteTitleAction,
  updateNotePinStatusAction,
  reorderNoteAction,
} from "@/app/actions/noteActions";

const useDebounce = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
): ((...args: Parameters<T>) => void) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);

      // Return cleanup function
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    },
    [callback, delay],
  );
};

export default function NoteBlock({
  details,
  userId,
  showDelete = true,
  onDelete,
  onPinStatusChange,
  isFirstPinned = false,
  isLastPinned = false,
  isFirstUnpinned = false,
  isLastUnpinned = false,
  onReorder,
}: {
  details: Note;
  userId: string;
  showDelete?: boolean;
  onDelete?: (noteId: string) => void;
  onPinStatusChange?: (noteId: string, isPinned: boolean) => void;
  isFirstPinned?: boolean;
  isLastPinned?: boolean;
  isFirstUnpinned?: boolean;
  isLastUnpinned?: boolean;
  onReorder?: (noteId: string, direction: "up" | "down") => void;
}) {
  // States
  const [noteTitle, setNoteTitle] = useState(details.title);
  const [noteContent, setNoteContent] = useState(details.content);
  const [editingTitle, setEditingTitle] = useState(false);
  const [isPinned, setIsPinned] = useState(details.pinned || false);
  const [isPinUpdating, setIsPinUpdating] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

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

  // Functions
  const updateStats = useCallback((text: string) => {
    // Create a temporary DOM element to parse HTML safelysettheme
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = text;

    // Get text content which removes all HTML tags and preserves proper spacing
    const plainText = tempDiv.textContent || tempDiv.innerText || "";

    // Normalize whitespace (replace multiple spaces with a single space)
    const normalizedText = plainText.replace(/\s+/g, " ").trim();

    // Count words (split by whitespace and filter out empty strings)
    const words = normalizedText
      ? normalizedText.split(/\s+/).filter(Boolean)
      : [];

    // Set the state with accurate counts
    setWordCount(words.length);
    setCharCount(plainText.length); // Count actual characters including whitespace
  }, []);

  // Get current theme color from ref
  const getThemeColor = () => themeColorRef.current;

  const setThemeColor = (color: string) => {
    themeColorRef.current = color;

    if (containerRef.current) {
      const elements = containerRef.current.querySelectorAll(
        `.theme-color-dependent`,
      );
      elements.forEach((el) => {
        if (el instanceof HTMLElement) {
          el.className = el.className.replace(/bg-[^ ]+/, color);
        }
      });
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
  const handleMoveNote = async (direction: "up" | "down") => {
    if (isReordering) return;

    setIsReordering(true);

    // Generate a unique operation ID
    const operationId = `${details.id}-${Date.now()}`;
    const operationTimestamp = Date.now();

    // Store the current operation details to handle race conditions
    reorderOperationRef.current = {
      id: operationId,
      timestamp: operationTimestamp,
    };

    setStatusWithTimeout(
      direction === "up" ? "Moving up..." : "Moving down...",
      <IconLoader className="animate-spin" />,
      false,
      10000,
    );

    try {
      const result = await reorderNoteAction(userId, details.id, direction);

      // Only process this response if it's the most recent operation
      if (reorderOperationRef.current?.id === operationId && result.success) {
        // Clear previous status
        clearStatusTimeout();

        // Generate a new message ID
        const messageId = Date.now();
        statusMessageIdRef.current = messageId;

        setSaveStatus("");
        setSaveIcon(null);

        // Set new status with a slight delay
        setTimeout(() => {
          // Only update if this is still the active message
          if (statusMessageIdRef.current === messageId) {
            setStatusWithTimeout(
              direction === "up" ? "Moved up" : "Moved down",
              <IconCircleCheck className="text-mercedes-primary" />,
              false,
              2000,
            );
          }
        }, 50);

        // Notify parent component
        if (onReorder) {
          onReorder(details.id, direction);
        }
      } else if (reorderOperationRef.current?.id === operationId) {
        // This is still the current operation but it failed
        setStatusWithTimeout(
          `Failed to move ${direction}`,
          <IconCircleX className="text-red-700" />,
          true,
          3000,
        );
        console.error(`Failed to move note ${direction}:`, result.error);
      }
    } catch (error) {
      // Only show error if this is still the current operation
      if (reorderOperationRef.current?.id === operationId) {
        setStatusWithTimeout(
          `Error moving ${direction}`,
          <IconCircleX className="text-red-700" />,
          true,
          3000,
        );
        console.error(`Error moving note ${direction}:`, error);
      }
    } finally {
      // Only update reordering state for the current operation
      if (reorderOperationRef.current?.id === operationId) {
        setIsReordering(false);
        reorderOperationRef.current = null;
      }
    }
  };

  // The key fix: Only save content that has actually changed
  const saveContent = useCallback(
    async (content: string, isManualSave = false) => {
      // Don't save if content hasn't changed
      if (content === lastSavedContentRef.current && !isManualSave) {
        return;
      }

      // Show status for both manual and background saves
      setStatusWithTimeout(
        "Saving...",
        <IconLoader className="animate-spin" />,
        false,
        10000,
      );

      // Only update loading opacity for manual saves
      if (isManualSave) {
        setIsPending(true);
      }

      try {
        const result = await updateNoteAction(userId, details.id, content);

        if (result.success) {
          // Only update the lastSavedContent after successful save
          lastSavedContentRef.current = content;

          // Show success for both manual and background saves
          setStatusWithTimeout(
            "Saved",
            <IconCircleCheck className="text-mercedes-primary" />,
            false,
            2000,
          );
        } else {
          // Show failure for both manual and background saves
          setStatusWithTimeout(
            "Failed to save",
            <IconCircleX className="text-red-700" />,
            true,
            3000,
          );
          console.error("Failed to save note:", result.error);
        }
      } catch (error) {
        // Show error for both manual and background saves
        setStatusWithTimeout(
          "Error saving",
          <IconCircleX className="text-red-700" />,
          true,
          3000,
        );
        console.error("Error saving note:", error);
      } finally {
        if (isManualSave) {
          setIsPending(false);
        }
      }
    },
    [userId, details.id],
  );

  // Manual save function
  const handleManualSave = () => {
    saveContent(noteContent, true);
  };

  // Debounced auto-save - this will NOT update any UI state
  const debouncedAutoSave = useDebounce((content: string) => {
    saveContent(content, false);
  }, 2000);

  const handleChange = useCallback(
    (value: string) => {
      // Update local state first for responsive UI
      setNoteContent(value);

      // Update stats using the more robust HTML stripping function
      updateStats(value);

      // Queue auto-save without affecting the UI
      debouncedAutoSave(value);
    },
    [updateStats, debouncedAutoSave],
  );

  // Pin/Unpin functionality
  const handleTogglePin = async () => {
    const newPinStatus = !isPinned;

    // Update local state immediately for responsive UI
    setIsPinned(newPinStatus);
    setIsPinUpdating(true);

    setStatusWithTimeout(
      newPinStatus ? "Pinning..." : "Unpinning...",
      <IconLoader className="animate-spin" />,
      false,
      10000,
    );

    try {
      const result = await updateNotePinStatusAction(
        userId,
        details.id,
        newPinStatus,
      );

      if (result.success) {
        // Create a unique message ID for this status update to handle race conditions
        const messageId = Date.now();
        statusMessageIdRef.current = messageId;

        // Clear previous status first to force UI update
        clearStatusTimeout();
        setSaveStatus("");
        setSaveIcon(null);

        // Then set the new status with a slight delay to ensure it's seen as a new message
        setTimeout(() => {
          // Only update if this is still the active message
          if (statusMessageIdRef.current === messageId) {
            setStatusWithTimeout(
              newPinStatus ? "Pinned" : "Unpinned",
              <IconCircleCheck className="text-mercedes-primary" />,
              false,
              2000,
            );
          }
        }, 50);

        // Notify parent component about the pin status change
        if (onPinStatusChange && result.notes) {
          // Find the updated note in the result
          const updatedNote = result.notes.find(
            (note) => note.id === details.id,
          );
          if (updatedNote) {
            onPinStatusChange(details.id, updatedNote.pinned || false);
          }
        }
      } else {
        // Revert local state if API call fails
        setIsPinned(!newPinStatus);
        setStatusWithTimeout(
          `Failed to ${newPinStatus ? "pin" : "unpin"}`,
          <IconCircleX className="text-red-700" />,
          true,
          3000,
        );
        console.error(
          `Failed to ${newPinStatus ? "pin" : "unpin"} note:`,
          result.error,
        );
      }
    } catch (error) {
      // Revert local state if API call throws an error
      setIsPinned(!newPinStatus);
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
    } finally {
      setIsPinUpdating(false);
    }
  };

  // The rest of your code remains largely unchanged
  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this note?")) {
      setIsDeleting(true);
      try {
        const result = await deleteNoteAction(userId, details.id);

        // If parent component has a callback for deletion, call it
        if (onDelete && typeof onDelete === "function" && result.success) {
          onDelete(details.id);
          // No need to set isDeleting to false as component will unmount
        } else {
          // If no callback exists, wait for revalidation (fallback)
          setTimeout(() => {
            setIsDeleting(false);
          }, 3000); // Timeout fallback in case revalidation takes too long
        }
      } catch (error) {
        console.error("Error deleting note:", error);
        setIsDeleting(false);
      }
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
      await updateNoteTitleAction(userId, details.id, noteTitle);
      setStatusWithTimeout(
        "Title saved",
        <IconCircleCheck className="text-mercedes-primary" />,
        false,
        2000,
      );
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

  // Effects
  // IMPORTANT: Only run this effect once on mount, not on every render
  useEffect(() => {
    setNoteContent(details.content);
    setNoteTitle(details.title);
    lastSavedContentRef.current = details.content;
    // Set initial pin status from the details
    setIsPinned(details.pinned || false);

    // Update stats with the more robust HTML stripping method
    updateStats(details.content);

    return () => {
      clearStatusTimeout();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setNoteTitle(details.title);

    return () => {
      clearStatusTimeout();
    };
  }, [details.title]);

  // Update pin status if the details change
  useEffect(() => {
    setIsPinned(details.pinned || false);
  }, [details.pinned]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [editingTitle]);

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

  return (
    <section
      ref={containerRef}
      className={`col-span-12 flex flex-col gap-3 ${
        isPending ? "opacity-70" : ""
      }`}
    >
      <article className={`flex gap-2 items-center`}>
        <div
          className={`group flex gap-2 items-center h-6 font-semibold uppercase`}
        >
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                ref={titleInputRef}
                type="text"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                className={`px-2 py-1 border border-mercedes-primary focus:outline-none rounded bg-white text-neutral-800 font-semibold`}
                maxLength={50}
              />
              <div className="flex items-center">
                <button
                  onClick={handleSaveTitle}
                  className={`p-1 cursor-pointer rounded-full text-mercedes-primary opacity-50 hover:opacity-100 transition-all duration-300 ease-in-out`}
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
              <span>{noteTitle}</span>
              <div
                className={`w-fit max-w-0 group-hover:max-w-[999px] overflow-hidden transition-all duration-500 ease-in-out cursor-pointer`}
                onClick={handleEditTitle}
              >
                <IconPencil
                  className={`opacity-50 hover:opacity-100 text-mercedes-primary transition-all duration-300 ease-in-out`}
                  size={20}
                  strokeWidth={2}
                />
              </div>
            </>
          )}
        </div>

        <div
          className={`flex-grow h-0.5 theme-color-dependent ${getThemeColor()} transition-all duration-300 ease-in-out`}
        ></div>

        {/* Order Controls */}
        <div className="flex items-center gap-1">
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
        </div>

        {saveStatus && (
          <div className="flex items-center gap-1 text-sm text-neutral-500 italic">
            {saveIcon}
            <span
              className={
                saveStatus === "Saved" ||
                saveStatus === "Pinned" ||
                saveStatus === "Unpinned" ||
                saveStatus === "Title saved" ||
                saveStatus === "Moved up" ||
                saveStatus === "Moved down"
                  ? "text-mercedes-primary"
                  : saveStatus.includes("fail") || saveStatus.includes("Error")
                    ? "text-red-700"
                    : ""
              }
            >
              {saveStatus}
            </span>
          </div>
        )}
      </article>

      {/* Note Content */}
      <article className={`grid grid-cols-12 gap-4`}>
        <div
          className={`col-span-12 sm:col-span-8 md:col-span-9 3xl:col-span-10`}
        >
          <TextBlock
            value={noteContent}
            onChange={handleChange}
            placeholder="Just start typing..."
          />
        </div>

        <div
          className={`p-4 col-span-12 sm:col-span-4 md:col-span-3 3xl:col-span-2 grid grid-cols-3 sm:flex sm:flex-col justify-start gap-2 bg-neutral-300 rounded-xl text-sm xs:text-lg sm:text-xl text-neutral-500/70 font-light capitalize`}
        >
          <article className={`flex justify-end w-full`}>
            {/* Pin button - show either pinned or unpinned based on state */}
            <button
              onClick={handleTogglePin}
              disabled={isPinUpdating}
              className={`p-1 border ${
                isPinned
                  ? "border-mercedes-primary bg-mercedes-primary text-neutral-100"
                  : "border-neutral-400 text-neutral-500 hover:border-mercedes-primary hover:text-mercedes-primary"
              } rounded-lg transition-all duration-300 ease-in-out ${
                isPinUpdating
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer"
              }`}
              title={isPinned ? "Unpin this note" : "Pin this note"}
            >
              {isPinned ? (
                <IconPinnedFilled size={20} strokeWidth={2} />
              ) : (
                <IconPin size={20} strokeWidth={2} />
              )}
            </button>
          </article>
          <p
            className={`p-1 xs:p-2 col-span-3 xs:col-span-1 flex xs:flex-col xl:flex-row items-center justify-center gap-1 xs:gap-0 lg:gap-1 rounded-xl border border-neutral-400`}
          >
            <span
              className={`text-mercedes-primary text-lg xs:text-xl sm:text-2xl font-medium`}
            >
              {wordCount}
            </span>
            <span>words</span>
          </p>

          <p
            className={`p-1 xs:p-2 col-span-3 xs:col-span-1 flex xs:flex-col xl:flex-row items-center justify-center gap-1 xs:gap-0 lg:gap-1 rounded-xl border border-neutral-400`}
          >
            <span
              className={`text-mercedes-primary text-lg xs:text-xl sm:text-2xl font-medium`}
            >
              {charCount}
            </span>
            <span>characters</span>
          </p>
        </div>
      </article>

      {/* Actions */}
      <article className={`flex gap-2 items-center`}>
        <button
          type={`button`}
          disabled={isPending}
          onClick={handleManualSave}
          title={`Save note manually`}
          className={`p-2 cursor-pointer flex items-center justify-center gap-1 rounded-lg border-2 border-mercedes-primary hover:bg-mercedes-primary text-neutral-800 transition-all duration-300 ease-in-out ${
            isPending ? "opacity-50 cursor-not-allowed" : ""
          }`}
          onPointerEnter={() => setThemeColor("bg-mercedes-primary")}
          onPointerLeave={() => setThemeColor("bg-neutral-300")}
        >
          <IconDeviceFloppy size={20} strokeWidth={2} />
        </button>

        <button
          type={`button`}
          onClick={handleExportTxt}
          title={`Export as text file`}
          className={`p-2 cursor-pointer flex items-center justify-center gap-1 rounded-lg border-2 border-mercedes-primary hover:bg-mercedes-primary text-neutral-800 transition-all duration-300 ease-in-out`}
          onPointerEnter={() => setThemeColor("bg-mercedes-primary")}
          onPointerLeave={() => setThemeColor("bg-neutral-300")}
        >
          <IconFileTypeTxt size={20} strokeWidth={2} />
        </button>

        <div
          className={`flex-grow h-0.5 theme-color-dependent ${getThemeColor()} transition-all duration-300 ease-in-out`}
        ></div>

        {showDelete && (
          <button
            type={`button`}
            onClick={handleDelete}
            title={`Delete this note`}
            className={`p-2 cursor-pointer flex items-center justify-center gap-1 rounded-lg hover:bg-red-700 text-neutral-800 hover:text-neutral-100 transition-all duration-300 ease-in-out`}
            onPointerEnter={() => setThemeColor("bg-red-700")}
            onPointerLeave={() => setThemeColor("bg-neutral-300")}
          >
            <IconTrash size={20} strokeWidth={2} />
          </button>
        )}
      </article>
    </section>
  );
}
