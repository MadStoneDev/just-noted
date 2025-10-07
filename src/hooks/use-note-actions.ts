import { useState, useCallback, useRef, ReactNode, createElement } from "react";
import { IconLoader, IconCircleCheck, IconCircleX } from "@tabler/icons-react";

interface UseNoteActionsOptions {
  noteId: string;
  onPinStatusChange?: (id: string, pinned: boolean) => void;
  onPrivacyStatusChange?: (id: string, isPrivate: boolean) => void;
  onReorder?: (id: string, direction: "up" | "down") => void;
  setStatus: (
    message: string,
    icon: ReactNode,
    isError?: boolean,
    delay?: number,
  ) => void;
}

interface UseNoteActionsReturn {
  handleTogglePin: (currentPinned: boolean) => void;
  handleTogglePrivacy: (currentPrivate: boolean) => void;
  handleMoveNote: (direction: "up" | "down") => void;
  isPinUpdating: boolean;
  isPrivacyUpdating: boolean;
  isReordering: boolean;
}

/**
 * Hook to handle note actions with consistent loading/success/error patterns
 *
 * @param options - Configuration object with callbacks and status setter
 * @returns Action handlers and loading states
 */
export function useNoteActions({
  noteId,
  onPinStatusChange,
  onPrivacyStatusChange,
  onReorder,
  setStatus,
}: UseNoteActionsOptions): UseNoteActionsReturn {
  const [isPinUpdating, setIsPinUpdating] = useState(false);
  const [isPrivacyUpdating, setIsPrivacyUpdating] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  const reorderOperationRef = useRef<{ id: string; timestamp: number } | null>(
    null,
  );

  /**
   * Generic action performer with consistent pattern:
   * 1. Show loading state
   * 2. Delay for optimistic UI update
   * 3. Execute action
   * 4. Show success message
   * 5. Handle errors consistently
   */
  const performAction = useCallback(
    async (
      actionName: string,
      successMessage: string,
      setLoading: (loading: boolean) => void,
      action: () => void,
      onError?: (error: unknown) => void,
    ) => {
      setLoading(true);

      const loadingIcon = createElement(IconLoader, {
        className: "animate-spin",
      });
      setStatus(`${actionName}...`, loadingIcon, false, 10000);

      try {
        // Short delay before applying optimistic UI update
        await new Promise((resolve) => setTimeout(resolve, 300));
        action();

        // Wait for action to complete (simulated delay)
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Clear previous status
        setStatus("", null, false, 0);

        // Small delay before showing success
        setTimeout(() => {
          const successIcon = createElement(IconCircleCheck, {
            className: "text-mercedes-primary",
          });
          setStatus(successMessage, successIcon, false, 2000);
        }, 50);
      } catch (error) {
        const errorIcon = createElement(IconCircleX, {
          className: "text-red-700",
        });
        setStatus(`Error ${actionName.toLowerCase()}`, errorIcon, true, 3000);
        console.error(error);
        onError?.(error);
      } finally {
        setLoading(false);
      }
    },
    [setStatus],
  );

  /**
   * Toggle pin status of the note
   */
  const handleTogglePin = useCallback(
    (currentPinned: boolean) => {
      const newPinStatus = !currentPinned;

      return performAction(
        newPinStatus ? "Pinning" : "Unpinning",
        newPinStatus ? "Pinned" : "Unpinned",
        setIsPinUpdating,
        () => {
          if (onPinStatusChange) {
            onPinStatusChange(noteId, newPinStatus);
          } else {
            throw new Error("No onPinStatusChange callback provided");
          }
        },
      );
    },
    [noteId, onPinStatusChange, performAction],
  );

  /**
   * Toggle privacy status of the note
   */
  const handleTogglePrivacy = useCallback(
    (currentPrivate: boolean) => {
      const newPrivacyStatus = !currentPrivate;

      return performAction(
        newPrivacyStatus ? "Setting to private" : "Setting to public",
        newPrivacyStatus ? "Set to private" : "Set to public",
        setIsPrivacyUpdating,
        () => {
          if (onPrivacyStatusChange) {
            onPrivacyStatusChange(noteId, newPrivacyStatus);
          } else {
            throw new Error("No onPrivacyStatusChange callback provided");
          }
        },
      );
    },
    [noteId, onPrivacyStatusChange, performAction],
  );

  /**
   * Move note up or down in the list
   */
  const handleMoveNote = useCallback(
    (direction: "up" | "down") => {
      if (isReordering) return;

      const operationId = `${noteId}-${Date.now()}`;
      reorderOperationRef.current = {
        id: operationId,
        timestamp: Date.now(),
      };

      return performAction(
        direction === "up" ? "Moving up" : "Moving down",
        direction === "up" ? "Moved up" : "Moved down",
        setIsReordering,
        () => {
          if (onReorder) {
            onReorder(noteId, direction);
          } else {
            throw new Error("No onReorder callback provided");
          }
        },
        () => {
          reorderOperationRef.current = null;
        },
      );
    },
    [noteId, onReorder, performAction, isReordering],
  );

  return {
    handleTogglePin,
    handleTogglePrivacy,
    handleMoveNote,
    isPinUpdating,
    isPrivacyUpdating,
    isReordering,
  };
}
