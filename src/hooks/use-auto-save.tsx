import { useCallback, useRef, useEffect } from "react";
import { DEBOUNCE_DELAY } from "@/constants/app";

export function useAutoSave(
  noteContent: string,
  saveFunction: (content: string, isManual?: boolean) => Promise<boolean | void>,
  delay: number = DEBOUNCE_DELAY,
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestContentRef = useRef(noteContent);
  const lastSavedContentRef = useRef(noteContent);
  const saveInProgressRef = useRef(false);
  const pendingRetryRef = useRef(false);
  const savePromiseRef = useRef<Promise<boolean | void> | null>(null);

  // Keep the latest saveFunction in a ref so the unmount/beforeunload effect can
  // call it without listing saveFunction as a dependency — otherwise that effect
  // re-runs (and fires an unintended save) every time saveFunction's identity
  // changes (e.g. on a goal edit).
  const saveFunctionRef = useRef(saveFunction);
  useEffect(() => {
    saveFunctionRef.current = saveFunction;
  }, [saveFunction]);

  // Update latest content ref when content changes
  useEffect(() => {
    latestContentRef.current = noteContent;
  }, [noteContent]);

  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;

  const executeSave = useCallback(async () => {
    const contentToSave = latestContentRef.current;

    // Don't save if content hasn't changed
    if (contentToSave === lastSavedContentRef.current) {
      retryCountRef.current = 0;
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
      const result = await promise;

      // Only mark as saved if the save function didn't explicitly return false
      if (result !== false) {
        lastSavedContentRef.current = contentToSave;
        retryCountRef.current = 0;
      }

      // After completing, check if content changed while we were saving
      const hasNewContent = pendingRetryRef.current || latestContentRef.current !== contentToSave;
      const shouldRetryFailure = result === false && retryCountRef.current < MAX_RETRIES;

      if (hasNewContent || shouldRetryFailure) {
        if (result === false) retryCountRef.current++;
        pendingRetryRef.current = false;
        saveInProgressRef.current = false;
        savePromiseRef.current = null;
        // Retry with latest content
        await executeSave();
        return;
      }

      // If we exhausted retries, reset counter so next user edit can try again
      if (result === false) {
        retryCountRef.current = 0;
      }
    } catch (error) {
      console.error("Auto-save failed:", error);
      retryCountRef.current = 0;
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

  // Cleanup on unmount — flush pending saves and add beforeunload backup.
  // Depends on [] (via saveFunctionRef) so it does NOT re-run on saveFunction
  // identity changes; it only fires on real unmount / tab close.
  useEffect(() => {
    // Fire-and-forget save of any unsaved content. Can't await here (beforeunload
    // and cleanup are synchronous), but the save path writes to IndexedDB before
    // the network call, so the latest content is persisted locally even if the
    // tab closes. We deliberately do NOT advance lastSavedContentRef — that would
    // falsely mark unpersisted content as saved.
    const saveIfDirty = () => {
      const content = latestContentRef.current;
      if (content !== lastSavedContentRef.current && !saveInProgressRef.current) {
        saveFunctionRef.current(content, false)?.catch?.(() => {});
      }
    };

    const handleBeforeUnload = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      saveIfDirty();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      saveIfDirty();
    };
  }, []);

  return {
    debouncedSave,
    flushSave,
    cancelSave,
  };
}
