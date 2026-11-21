import { useCallback, useRef, useEffect, type MutableRefObject } from "react";
import { DEBOUNCE_DELAY } from "@/constants/app";

export function useAutoSave(
  noteContent: string,
  saveFunction: (content: string, isManual?: boolean) => Promise<boolean | void>,
  delay: number = DEBOUNCE_DELAY,
  options: {
    /**
     * Run synchronously before any save-on-leave (flushSave, beforeunload,
     * unmount) so upstream debounces (the editor's change emission) deliver
     * their latest value first — via setLatestContent — instead of being lost.
     */
    onBeforeFlush?: () => void;
    /**
     * The caller's "last saved content" ref, used as THE baseline. Pass it when
     * the caller also decides what counts as saved (the note editor adopts the
     * load re-serialisation, adopts external changes, advances it on each
     * landed save): with two separate baselines they drift apart, and the
     * editor shows "Saving…" for a change this hook thinks is already saved,
     * or this hook skips a save the editor is waiting on.
     */
    lastSavedRef?: MutableRefObject<string>;
  } = {},
) {
  const onBeforeFlushRef = useRef(options.onBeforeFlush);
  onBeforeFlushRef.current = options.onBeforeFlush;
  const runBeforeFlush = () => {
    try {
      onBeforeFlushRef.current?.();
    } catch (error) {
      console.error("Auto-save pre-flush failed:", error);
    }
  };
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestContentRef = useRef(noteContent);
  const ownLastSavedRef = useRef(noteContent);
  const lastSavedContentRef = options.lastSavedRef ?? ownLastSavedRef;
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
    runBeforeFlush();
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
        const result = await promise;
        // Same rule as executeSave: an explicit false is a failed save — the
        // content stays unsaved (and, with a shared baseline, the caller dirty).
        if (result !== false) lastSavedContentRef.current = contentToSave;
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
      runBeforeFlush();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      saveIfDirty();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Runs before the editor's own cleanup (ancestor effects unmount first),
      // so the editor is still alive to hand over its last keystrokes.
      runBeforeFlush();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      saveIfDirty();
    };
  }, []);

  // Synchronous update of the content to save. The effect above lags a render
  // behind; a change delivered by onBeforeFlush during unmount never renders,
  // so the caller pushes it here directly.
  const setLatestContent = useCallback((content: string) => {
    latestContentRef.current = content;
  }, []);

  return {
    debouncedSave,
    flushSave,
    cancelSave,
    setLatestContent,
  };
}
