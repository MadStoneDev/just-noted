import { useCallback, useRef, useEffect } from "react";

export function useAutoSave(
  noteContent: string,
  saveFunction: (content: string, isManual?: boolean) => Promise<void>,
  delay: number = 2000,
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestContentRef = useRef(noteContent);
  const lastSavedContentRef = useRef(noteContent);
  const saveInProgressRef = useRef(false);

  // Update latest content ref when content changes
  useEffect(() => {
    latestContentRef.current = noteContent;
  }, [noteContent]);

  const debouncedSave = useCallback(() => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Set new timeout
    timeoutRef.current = setTimeout(async () => {
      const contentToSave = latestContentRef.current;

      // Don't save if content hasn't changed or save is in progress
      if (
        contentToSave === lastSavedContentRef.current ||
        saveInProgressRef.current
      ) {
        return;
      }

      try {
        saveInProgressRef.current = true;
        await saveFunction(contentToSave, false);
        lastSavedContentRef.current = contentToSave;
      } catch (error) {
        console.error("Auto-save failed:", error);
      } finally {
        saveInProgressRef.current = false;
      }
    }, delay);
  }, [saveFunction, delay]);

  const flushSave = useCallback(async () => {
    // Cancel pending auto-save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const contentToSave = latestContentRef.current;

    // Only save if content has changed and no save in progress
    if (
      contentToSave !== lastSavedContentRef.current &&
      !saveInProgressRef.current
    ) {
      try {
        saveInProgressRef.current = true;
        await saveFunction(contentToSave, false);
        lastSavedContentRef.current = contentToSave;
      } catch (error) {
        console.error("Flush save failed:", error);
      } finally {
        saveInProgressRef.current = false;
      }
    }
  }, [saveFunction]);

  const cancelSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    debouncedSave,
    flushSave,
    cancelSave,
    isSaveInProgress: () => saveInProgressRef.current,
  };
}
