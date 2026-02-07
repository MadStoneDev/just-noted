import React from "react";
import {
  IconArrowDown,
  IconArrowsMaximize,
  IconArrowUp,
  IconEye,
  IconEyeClosed,
  IconLayoutColumns,
  IconLock,
  IconLockOpen,
  IconPin,
  IconPinnedFilled,
} from "@tabler/icons-react";

interface NoteActionsProps {
  isPinned: boolean;
  isPrivate: boolean;
  isPinUpdating: boolean;
  isPrivacyUpdating: boolean;
  isReordering: boolean;
  isContentVisible: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  distractionFreeMode: boolean;
  isSaving: boolean;
  onTogglePin: () => void;
  onTogglePrivacy: () => void;
  onToggleVisibility: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onOpenDistractionFree?: () => void;
  onOpenSplitView?: () => void;
}

/**
 * Note actions component
 * Contains all action buttons: pin, privacy, visibility, move, distraction-free
 */
export default function NoteActions({
  isPinned,
  isPrivate,
  isPinUpdating,
  isPrivacyUpdating,
  isReordering,
  isContentVisible,
  canMoveUp,
  canMoveDown,
  distractionFreeMode,
  isSaving,
  onTogglePin,
  onTogglePrivacy,
  onToggleVisibility,
  onMoveUp,
  onMoveDown,
  onOpenDistractionFree,
  onOpenSplitView,
}: NoteActionsProps) {
  if (distractionFreeMode) {
    return null;
  }

  return (
    <div className="flex justify-end items-center gap-1">
      {/* Visibility toggle */}
      <button
        type="button"
        onClick={onToggleVisibility}
        className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-all duration-300 ease-in-out`}
        title={isContentVisible ? "Hide note content" : "Show note content"}
        aria-label={isContentVisible ? "Hide note content" : "Show note content"}
      >
        {isContentVisible ? (
          <IconEye size={18} strokeWidth={1.5} />
        ) : (
          <IconEyeClosed size={18} strokeWidth={1.5} />
        )}
      </button>

      {/* Distraction-free mode */}
      {onOpenDistractionFree && (
        <button
          type="button"
          onClick={onOpenDistractionFree}
          disabled={isSaving}
          className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer rounded-lg ${
            isSaving
              ? "opacity-30 cursor-not-allowed text-neutral-400"
              : "text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
          } transition-all duration-300 ease-in-out`}
          title={
            isSaving ? "Saving... Please wait" : "Open Distraction-Free Mode"
          }
          aria-label={
            isSaving ? "Saving... Please wait" : "Open Distraction-Free Mode"
          }
        >
          <IconArrowsMaximize size={18} strokeWidth={1.5} />
        </button>
      )}

      {/* Split view mode */}
      {onOpenSplitView && (
        <button
          type="button"
          onClick={onOpenSplitView}
          disabled={isSaving}
          className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer rounded-lg ${
            isSaving
              ? "opacity-30 cursor-not-allowed text-neutral-400"
              : "text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
          } transition-all duration-300 ease-in-out`}
          title={isSaving ? "Saving... Please wait" : "Open Split View"}
          aria-label={isSaving ? "Saving... Please wait" : "Open Split View"}
        >
          <IconLayoutColumns size={18} strokeWidth={1.5} />
        </button>
      )}

      {/* Move up */}
      <button
        type="button"
        onClick={onMoveUp}
        disabled={!canMoveUp || isReordering}
        className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer rounded-lg ${
          !canMoveUp || isReordering
            ? "opacity-30 cursor-not-allowed text-neutral-400"
            : "text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
        } transition-all duration-300 ease-in-out`}
        title="Move note up"
        aria-label="Move note up"
      >
        <IconArrowUp size={18} strokeWidth={1.5} />
      </button>

      {/* Move down */}
      <button
        type="button"
        onClick={onMoveDown}
        disabled={!canMoveDown || isReordering}
        className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer rounded-lg ${
          !canMoveDown || isReordering
            ? "opacity-30 cursor-not-allowed text-neutral-400"
            : "text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
        } transition-all duration-300 ease-in-out`}
        title="Move note down"
        aria-label="Move note down"
      >
        <IconArrowDown size={18} strokeWidth={1.5} />
      </button>

      <article className={`flex justify-end gap-2 w-full`}>
        {/* Pin button */}
        <button
          onClick={onTogglePin}
          disabled={isPinUpdating}
          className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center border ${
            isPinned
              ? `text-neutral-100 hover:text-neutral-100 ${
                  isPrivate
                    ? "border-violet-800 hover:border-violet-800 bg-violet-800 hover:bg-violet-600"
                    : "border-mercedes-primary hover:border-mercedes-primary/60 bg-mercedes-primary hover:bg-mercedes-primary/70"
                }`
              : "border-neutral-400 text-neutral-500 hover:bg-neutral-50"
          } rounded-lg transition-all duration-300 ease-in-out ${
            isPinUpdating ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          }`}
          title={isPinned ? "Unpin this note" : "Pin this note"}
          aria-label={isPinned ? "Unpin this note" : "Pin this note"}
        >
          {isPinned ? (
            <IconPinnedFilled size={18} strokeWidth={2} />
          ) : (
            <IconPin size={18} strokeWidth={2} />
          )}
        </button>

        {/* Privacy toggle button */}
        <button
          onClick={onTogglePrivacy}
          disabled={isPrivacyUpdating}
          className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center border rounded-lg transition-all duration-300 ease-in-out ${
            isPrivacyUpdating
              ? "opacity-50 cursor-not-allowed"
              : "cursor-pointer"
          } ${
            isPrivate
              ? "border-violet-800 hover:border-violet-600 bg-violet-800 hover:bg-violet-600 text-neutral-100"
              : "border-neutral-400 hover:bg-neutral-200 text-neutral-500"
          }`}
          title={isPrivate ? "Make this note public" : "Make this note private"}
          aria-label={isPrivate ? "Make this note public" : "Make this note private"}
        >
          {isPrivate ? (
            <IconLock size={18} strokeWidth={2} />
          ) : (
            <IconLockOpen size={18} strokeWidth={2} />
          )}
        </button>
      </article>
    </div>
  );
}
