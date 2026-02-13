"use client";

import { useState, useEffect, useRef } from "react";
import { getQueueSize, processQueue, subscribe } from "@/utils/offline-queue";
import { QUEUE_RETRY_INTERVAL } from "@/constants/app";

interface OnlineStatus {
  isOnline: boolean;
  lastOnlineAt: Date | null;
  lastOfflineAt: Date | null;
}

/**
 * Hook to track browser online/offline status
 * Provides real-time updates when network status changes
 */
export function useOnlineStatus(): OnlineStatus {
  const [status, setStatus] = useState<OnlineStatus>({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    lastOnlineAt: null,
    lastOfflineAt: null,
  });

  useEffect(() => {
    const handleOnline = () => {
      setStatus((prev) => ({
        ...prev,
        isOnline: true,
        lastOnlineAt: new Date(),
      }));
    };

    const handleOffline = () => {
      setStatus((prev) => ({
        ...prev,
        isOnline: false,
        lastOfflineAt: new Date(),
      }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Set initial state
    if (typeof navigator !== "undefined") {
      setStatus((prev) => ({
        ...prev,
        isOnline: navigator.onLine,
      }));
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return status;
}

/**
 * Hook to manage offline operations queue.
 * Thin React wrapper over the IDB-backed queue in src/utils/offline-queue.ts.
 */
export function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const { isOnline } = useOnlineStatus();
  const prevOnlineRef = useRef(isOnline);

  // Subscribe to queue size changes
  useEffect(() => {
    getQueueSize().then(setPendingCount);
    return subscribe((count) => setPendingCount(count));
  }, []);

  // Process on offline→online transition
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (wasOffline && isOnline) {
      setIsProcessing(true);
      processQueue().finally(() => setIsProcessing(false));
    }
  }, [isOnline]);

  // Periodic retry while online with pending ops
  useEffect(() => {
    if (!isOnline || pendingCount === 0) return;
    const interval = setInterval(() => {
      processQueue();
    }, QUEUE_RETRY_INTERVAL);
    return () => clearInterval(interval);
  }, [isOnline, pendingCount]);

  return { pendingCount, isProcessing, isOnline };
}
