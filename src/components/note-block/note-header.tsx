import React, { useRef, useEffect } from "react";
import {
  IconCheck,
  IconX,
  IconPencil,
  IconLock,
  IconCloud,
  IconDeviceDesktop,
} from "@tabler/icons-react";
import type { NoteSource } from "@/types/combined-notes";

interface NoteHeaderProps {
  noteTitle: string;
  isPrivate: boolean;
  isPinned: boolean;
  noteSource: NoteSource;
  editingTitle: boolean;
  saveStatus: string;
  saveIcon: React.ReactNode;
  isNewNote?: boolean;
  hasPinnedNotes?: boolean;
  onEditTitle: () => void;
  onSaveTitle: () => void;
  onCancelEdit: () => void;
  onTitleChange: (title: string) => void;
  onTitleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Note header component
 * Displays title (editable), privacy lock icon, source badge, and save status
 */
export default function NoteHeader({
  noteTitle,
  isPrivate,
  isPinned,
  noteSource,
  editingTitle,
  saveStatus,
  saveIcon,
  isNewNote = false,
  hasPinnedNotes = false,
  onEditTitle,
  onSaveTitle,
  onCancelEdit,
  onTitleChange,
  onTitleKeyDown,
}: NoteHeaderProps) {
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input when editing starts
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [editingTitle]);

  return (
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
              onChange={(e) => onTitleChange(e.target.value)}
              onKeyDown={onTitleKeyDown}
              className={`px-2 py-1 border ${
                isPrivate ? "border-violet-800" : "border-mercedes-primary"
              } focus:outline-none rounded bg-white text-neutral-800 font-semibold`}
              maxLength={50}
            />
            <div className="flex items-center">
              <button
                onClick={onSaveTitle}
                className={`p-1 cursor-pointer rounded-full ${
                  isPrivate ? "text-violet-800" : "text-mercedes-primary"
                } opacity-50 hover:opacity-100 transition-all duration-300 ease-in-out`}
              >
                <IconCheck size={18} strokeWidth={2} />
              </button>
              <button
                onClick={onCancelEdit}
                className={`p-1 cursor-pointer rounded-full text-red-700 opacity-50 hover:opacity-100 transition-all duration-300 ease-in-out`}
              >
                <IconX size={18} strokeWidth={2} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <article className={`flex-grow flex items-center gap-1`}>
              <span className={`flex items-center gap-1 min-w-fit max-w-[90%]`}>
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
                onClick={onEditTitle}
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

            {/* Mobile save status */}
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

            {/* Source badge */}
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

      {/* Divider */}
      <div
        className={`flex-grow h-0.5 ${
          isPrivate
            ? "bg-violet-800"
            : isPinned
              ? "bg-mercedes-primary"
              : "bg-neutral-300"
        } transition-all duration-300 ease-in-out`}
      ></div>

      {/* ADD: New note indicator */}
      {isNewNote && hasPinnedNotes && (
        <div className="mb-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <span>
            New note! After refresh, this will move below pinned notes.
          </span>
        </div>
      )}

      {/* Desktop save status */}
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
    </article>
  );
}
