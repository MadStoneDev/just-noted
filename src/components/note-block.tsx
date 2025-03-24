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
} from "@tabler/icons-react";

import {
  deleteNoteAction,
  updateNoteAction,
  updateNoteTitleAction,
} from "@/app/actions/noteActions";

// Keeping your original debounce logic
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
    },
    [callback, delay],
  );
};

export default function NoteBlock({
  details,
  userId,
  showDelete = true,
}: {
  details: Note;
  userId: string;
  showDelete?: boolean;
}) {
  // States
  const [noteTitle, setNoteTitle] = useState(details.title);
  const [noteContent, setNoteContent] = useState(details.content);
  const [editingTitle, setEditingTitle] = useState(false);

  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  const [themeColour, setThemeColour] = useState("bg-neutral-300");

  const [saveStatus, setSaveStatus] = useState("");
  const [saveIcon, setSaveIcon] = useState<React.ReactNode | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // This ref stores the last content that was saved to prevent duplicate saves
  const lastSavedContentRef = useRef(details.content);

  // Functions
  const updateStats = useCallback((text: string) => {
    const words: string[] = text.split(/\s+/).filter((word) => word !== "");
    const chars = text.replace(/<[^>]*>/g, "").trim();
    setWordCount(words.length);
    setCharCount(chars.length);
  }, []);

  // Clear status timeout helper function
  const clearStatusTimeout = () => {
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = null;
    }
  };

  // Set status with auto-clear after delay
  const setStatusWithTimeout = (
    message: string,
    icon: React.ReactNode,
    isError = false,
    delay = 2000,
  ) => {
    clearStatusTimeout();
    setSaveStatus(message);
    setSaveIcon(icon);

    statusTimeoutRef.current = setTimeout(() => {
      setSaveStatus("");
      setSaveIcon(null);
    }, delay);
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

      // Update stats
      const plainText = value.replace(/<[^>]*>/g, "").trim();
      updateStats(plainText);

      // Queue auto-save without affecting the UI
      debouncedAutoSave(value);
    },
    [updateStats, debouncedAutoSave],
  );

  // The rest of your code remains largely unchanged
  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this note?")) {
      setIsDeleting(true);
      try {
        await deleteNoteAction(userId, details.id);
        // The revalidation in the server action will refresh the UI
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
    const textContent = `${noteTitle}\n\n${noteContent.replace(
      /<[^>]*>/g,
      "",
    )}`;
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
  // IMPORTANT: Only run this effect once on mount, not on every render or updateStats change
  useEffect(() => {
    setNoteContent(details.content);
    setNoteTitle(details.title);
    lastSavedContentRef.current = details.content;

    const plainText = details.content.replace(/<[^>]*>/g, "").trim();
    updateStats(plainText);

    return () => {
      clearStatusTimeout();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array to run only on mount

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
          className={`flex-grow h-0.5 ${themeColour} transition-all duration-300 ease-in-out`}
        ></div>

        {saveStatus && (
          <div className="flex items-center gap-1 text-sm text-neutral-500 italic">
            {saveIcon}
            <span
              className={
                saveStatus === "Saved"
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
          onPointerEnter={() => setThemeColour("bg-mercedes-primary")}
          onPointerLeave={() => setThemeColour("bg-neutral-300")}
        >
          <IconDeviceFloppy size={20} strokeWidth={2} />
        </button>

        <button
          type={`button`}
          onClick={handleExportTxt}
          title={`Export as text file`}
          className={`p-2 cursor-pointer flex items-center justify-center gap-1 rounded-lg border-2 border-mercedes-primary hover:bg-mercedes-primary text-neutral-800 transition-all duration-300 ease-in-out`}
          onPointerEnter={() => setThemeColour("bg-mercedes-primary")}
          onPointerLeave={() => setThemeColour("bg-neutral-300")}
        >
          <IconFileTypeTxt size={20} strokeWidth={2} />
        </button>

        <div
          className={`flex-grow h-0.5 ${themeColour} transition-all duration-300 ease-in-out`}
        ></div>

        {showDelete && (
          <button
            type={`button`}
            onClick={handleDelete}
            title={`Delete this note`}
            className={`p-2 cursor-pointer flex items-center justify-center gap-1 rounded-lg hover:bg-red-700 text-neutral-800 hover:text-neutral-100 transition-all duration-300 ease-in-out`}
            onPointerEnter={() => setThemeColour("bg-red-700")}
            onPointerLeave={() => setThemeColour("bg-neutral-300")}
          >
            <IconTrash size={20} strokeWidth={2} />
          </button>
        )}
      </article>
    </section>
  );
}
