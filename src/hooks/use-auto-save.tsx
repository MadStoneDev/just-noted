import { useCallback, useRef, useEffect } from "react";
import { DEBOUNCE_DELAY } from "@/constants/app";

export function useAutoSave(
  noteContent: string,
  saveFunction: (content: string, isManual?: boolean) => Promise<void>,
  delay: number = DEBOUNCE_DELAY,
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestContentRef = useRef(noteContent);
  const lastSavedContentRef = useRef(noteContent);
  const saveInProgressRef = useRef(false);
  const pendingRetryRef = useRef(false);
  const savePromiseRef = useRef<Promise<void> | null>(null);

  // Update latest content ref when content changes
  useEffect(() => {
    latestContentRef.current = noteContent;
  }, [noteContent]);

  const executeSave = useCallback(async () => {
    const contentToSave = latestContentRef.current;

    // Don't save if content hasn't changed
    if (contentToSave === lastSavedContentRef.current) {
      return;
    }

    // If save is already in progress, mark for retry instead of dropping
    if (saveInProgressRef.current) {
      pendingRetryRef.current = true;
      return;
    }

    try {
      saveInProgressRef.current = true;
      pendingRetryRef.current = false;
      const promise = saveFunction(contentToSave, false);
      savePromiseRef.current = promise;
      await promise;
      lastSavedContentRef.current = contentToSave;

      // After completing, check if content changed while we were saving
      if (pendingRetryRef.current || latestContentRef.current !== contentToSave) {
        pendingRetryRef.current = false;
        saveInProgressRef.current = false;
        savePromiseRef.current = null;
        // Retry with latest content
        await executeSave();
        return;
      }
    } catch (error) {
      console.error("Auto-save failed:", error);
    } finally {
      saveInProgressRef.current = false;
      savePromiseRef.current = null;
    }
  }, [saveFunction]);

  const debouncedSave = useCallback(() => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      executeSave();
    }, delay);
  }, [executeSave, delay]);

  const flushSave = useCallback(async () => {
    // Cancel pending auto-save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // If save is in progress, wait for it to complete first
    if (saveInProgressRef.current && savePromiseRef.current) {
      try {
        await savePromiseRef.current;
      } catch {
        // Ignore errors from the in-flight save, we'll retry below
      }
    }

    // Now save the latest content if it differs
    const contentToSave = latestContentRef.current;
    if (contentToSave !== lastSavedContentRef.current && !saveInProgressRef.current) {
      try {
        saveInProgressRef.current = true;
        const promise = saveFunction(contentToSave, false);
        savePromiseRef.current = promise;
        await promise;
        lastSavedContentRef.current = contentToSave;
      } catch (error) {
        console.error("Flush save failed:", error);
      } finally {
        saveInProgressRef.current = false;
        savePromiseRef.current = null;
      }
    }
  }, [saveFunction]);

  const cancelSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Cleanup on unmount — flush pending saves and add beforeunload backup
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Best-effort: try to save synchronously via navigator.sendBeacon is not
      // suitable for async saves, but clearing the timeout prevents orphaned timers
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // Attempt to flush on unmount
      flushSave();
    };
  }, [flushSave]);

  return {
    debouncedSave,
    flushSave,
    cancelSave,
  };
}
