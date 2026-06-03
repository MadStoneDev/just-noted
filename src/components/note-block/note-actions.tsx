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
        className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer rounded-[var(--radius-lg)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-all duration-300 ease-in-out`}
        title={isContentVisible ? "Hide note content" : "Show note content"}
        aria-label={isContentVisible ? "Hide note content" : "Show note content"}
      >
        {isContentVisible ? (
          <IconEye size={18} strokeWidth={1.5} />
        ) : (
          <IconEyeClosed size={18} strokeWidth={1.5} />
        )}
      </button>

      {/* Distraction-free mode — hidden on mobile */}
      {onOpenDistractionFree && (
        <button
          type="button"
          onClick={onOpenDistractionFree}
          disabled={isSaving}
          className={`hidden md:flex p-2.5 min-w-[44px] min-h-[44px] items-center justify-center cursor-pointer rounded-[var(--radius-lg)] ${
            isSaving
              ? "opacity-30 cursor-not-allowed text-[var(--color-text-tertiary)]"
              : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]"
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

      {/* Split view mode — hidden on mobile */}
      {onOpenSplitView && (
        <button
          type="button"
          onClick={onOpenSplitView}
          disabled={isSaving}
          className={`hidden md:flex p-2.5 min-w-[44px] min-h-[44px] items-center justify-center cursor-pointer rounded-[var(--radius-lg)] ${
            isSaving
              ? "opacity-30 cursor-not-allowed text-[var(--color-text-tertiary)]"
              : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]"
          } transition-all duration-300 ease-in-out`}
          title={isSaving ? "Saving... Please wait" : "Open Split View"}
          aria-label={isSaving ? "Saving... Please wait" : "Open Split View"}
        >
          <IconLayoutColumns size={18} strokeWidth={1.5} />
        </button>
      )}

      {/* Move up — hidden on mobile */}
      <button
        type="button"
        onClick={onMoveUp}
        disabled={!canMoveUp || isReordering}
        className={`hidden md:flex p-2.5 min-w-[44px] min-h-[44px] items-center justify-center cursor-pointer rounded-[var(--radius-lg)] ${
          !canMoveUp || isReordering
            ? "opacity-30 cursor-not-allowed text-[var(--color-text-tertiary)]"
            : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]"
        } transition-all duration-300 ease-in-out`}
        title="Move note up"
        aria-label="Move note up"
      >
        <IconArrowUp size={18} strokeWidth={1.5} />
      </button>

      {/* Move down — hidden on mobile */}
      <button
        type="button"
        onClick={onMoveDown}
        disabled={!canMoveDown || isReordering}
        className={`hidden md:flex p-2.5 min-w-[44px] min-h-[44px] items-center justify-center cursor-pointer rounded-[var(--radius-lg)] ${
          !canMoveDown || isReordering
            ? "opacity-30 cursor-not-allowed text-[var(--color-text-tertiary)]"
            : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]"
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
              ? `text-[var(--color-text-inverse)] hover:text-[var(--color-text-inverse)] ${
                  isPrivate
                    ? "border-[var(--color-accent)] hover:border-[var(--color-accent)] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]"
                    : "border-[var(--color-accent)] hover:border-[var(--color-accent)]/60 bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/70"
                }`
              : "border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
          } rounded-[var(--radius-lg)] transition-all duration-300 ease-in-out ${
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
          className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center border rounded-[var(--radius-lg)] transition-all duration-300 ease-in-out ${
            isPrivacyUpdating
              ? "opacity-50 cursor-not-allowed"
              : "cursor-pointer"
          } ${
            isPrivate
              ? "border-[var(--color-accent)] hover:border-[var(--color-accent-hover)] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-text-inverse)]"
              : "border-[var(--color-border-primary)] hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
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
