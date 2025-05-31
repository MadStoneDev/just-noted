import { useState, useRef, useCallback, useEffect } from "react";

export const useOptimisedDebounce = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  dependencies: any[] = [],
): {
  debouncedFn: (...args: Parameters<T>) => void;
  isPending: boolean;
  cancel: () => void;
  flush: () => void;
} => {
  const [isPending, setIsPending] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const argsRef = useRef<Parameters<T> | null>(null);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setIsPending(false);
      argsRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    if (timeoutRef.current && argsRef.current) {
      clearTimeout(timeoutRef.current);
      callback(...argsRef.current);
      timeoutRef.current = null;
      argsRef.current = null;
      setIsPending(false);
    }
  }, [callback]);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      argsRef.current = args;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setIsPending(true);

      timeoutRef.current = setTimeout(() => {
        if (argsRef.current) {
          callback(...argsRef.current);
          argsRef.current = null;
        }
        setIsPending(false);
        timeoutRef.current = null;
      }, delay);
    },
    [callback, delay, ...dependencies],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { debouncedFn, isPending, cancel, flush };
};
