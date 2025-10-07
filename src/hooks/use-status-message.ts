import { useState, useRef, useCallback } from "react";

/**
 * Hook to manage status messages with auto-clear and race condition prevention
 *
 * @param defaultDelay - Default delay in milliseconds before clearing message (default: 2000)
 * @returns Object with message, icon, setStatus, and clearStatus functions
 */
export function useStatusMessage(defaultDelay = 2000) {
  const [message, setMessage] = useState("");
  const [icon, setIcon] = useState<React.ReactNode>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageIdRef = useRef(0);

  /**
   * Clear any existing timeout
   */
  const clearStatusTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  /**
   * Set a status message with optional auto-clear
   *
   * @param msg - Message to display
   * @param statusIcon - Icon to display alongside message
   * @param isError - Whether this is an error message (currently unused, for future styling)
   * @param delay - Time in milliseconds before auto-clearing (0 = no auto-clear)
   */
  const setStatus = useCallback(
    (
      msg: string,
      statusIcon: React.ReactNode,
      isError = false,
      delay = defaultDelay,
    ) => {
      clearStatusTimeout();

      // Generate unique ID for this message to prevent race conditions
      const messageId = Date.now();
      messageIdRef.current = messageId;

      setMessage(msg);
      setIcon(statusIcon);

      // Only set timeout if delay > 0
      if (delay > 0) {
        timeoutRef.current = setTimeout(() => {
          // Only clear if this is still the active message
          if (messageIdRef.current === messageId) {
            setMessage("");
            setIcon(null);
          }
        }, delay);
      }
    },
    [defaultDelay, clearStatusTimeout],
  );

  /**
   * Manually clear the status message
   */
  const clearStatus = useCallback(() => {
    clearStatusTimeout();
    setMessage("");
    setIcon(null);
  }, [clearStatusTimeout]);

  return {
    message,
    icon,
    setStatus,
    clearStatus,
  };
}
