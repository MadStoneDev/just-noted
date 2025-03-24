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
} from "@tabler/icons-react";

import {
  deleteNoteAction,
  updateNoteAction,
  updateNoteTitleAction,
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
  const [isPending, setIsPending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const lastSavedContent = useRef(details.content);

  // Functions
  const updateStats = useCallback((text: string) => {
    const words: string[] = text.split(/\s+/).filter((word) => word !== "");

    const chars = text.replace(/<[^>]*>/g, "").trim();

    setWordCount(words.length);
    setCharCount(chars.length);
  }, []);

  const saveNote = useCallback(
    async (content: string) => {
      if (content === lastSavedContent.current) return;

      setSaveStatus("Saving...");
      setIsPending(true);

      try {
        const result = await updateNoteAction(userId, details.id, content);
        if (result.success) {
          setSaveStatus("Saved");
          lastSavedContent.current = content;
        } else {
          setSaveStatus("Failed to save");
          console.error("Failed to save note:", result.error);
        }
      } catch (error) {
        setSaveStatus("Error saving");
        console.error("Error saving note:", error);
      } finally {
        setIsPending(false);

        setTimeout(() => {
          setSaveStatus("");
        }, 2000);
      }
    },
    [userId, details.id],
  );

  const debouncedSaveNote = useDebounce(saveNote, 1000);

  const handleChange = useCallback(
    (value: string) => {
      setNoteContent(value);
      const plainText = value.replace(/<[^>]*>/g, "").trim();
      updateStats(plainText);

      debouncedSaveNote(value);
      setSaveStatus("Editing...");
    },
    [updateStats, debouncedSaveNote],
  );

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

    setIsPending(true);
    try {
      await updateNoteTitleAction(userId, details.id, noteTitle);
      setEditingTitle(false);
    } catch (error) {
      console.error("Error updating note title:", error);
    } finally {
      setIsPending(false);
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
  useEffect(() => {
    setNoteContent(details.content);
    setNoteTitle(details.title);
    lastSavedContent.current = details.content;

    const plainText = details.content.replace(/<[^>]*>/g, "").trim();
    updateStats(plainText);
  }, [details, updateStats]);

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
          className={`group flex gap-2 items-center h-10 font-semibold uppercase`}
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
          <div className="text-sm text-neutral-500 italic animate-pulse">
            {saveStatus}
          </div>
        )}
      </article>

      {/* Note Content */}
      <article className={`grid grid-cols-12 gap-4`}>
        <div
          className={`col-span-12 sm:col-span-8 md:col-span-9 xl:col-span-10`}
        >
          <TextBlock
            value={noteContent}
            onChange={handleChange}
            placeholder="Just start typing..."
          />
        </div>

        <div
          className={`p-4 col-span-12 sm:col-span-4 md:col-span-3 xl:col-span-2 grid grid-cols-3 sm:flex sm:flex-col justify-center gap-2 bg-neutral-300 rounded-xl text-sm xs:text-lg sm:text-xl text-neutral-500/70 font-light capitalize`}
        >
          <p
            className={`p-1 xs:p-2 col-span-3 xs:col-span-1 flex xs:flex-col lg:flex-row items-center justify-center gap-1 xs:gap-0 lg:gap-1 rounded-xl border border-neutral-400`}
          >
            <span
              className={`text-mercedes-primary text-lg xs:text-xl sm:text-2xl font-medium`}
            >
              {wordCount}
            </span>
            <span>words</span>
          </p>

          <p
            className={`p-1 xs:p-2 col-span-3 xs:col-span-1 flex xs:flex-col lg:flex-row items-center justify-center gap-1 xs:gap-0 lg:gap-1 rounded-xl border border-neutral-400`}
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
          onClick={handleExportTxt}
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
