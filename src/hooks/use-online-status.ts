"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { noteOperation } from "@/app/actions/notes";

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

// Storage key for offline queue
const OFFLINE_QUEUE_KEY = "justnoted_offline_queue";

interface QueuedOperation {
  id: string;
  type: "create" | "update" | "delete" | "updateTitle" | "updatePin" | "updatePrivacy";
  noteId: string;
  data: Record<string, any>;
  timestamp: number;
}

/**
 * Hook to manage offline operations queue
 * Queues operations when offline and processes them when back online
 */
export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedOperation[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { isOnline } = useOnlineStatus();
  const prevOnlineRef = useRef(isOnline);

  // Load queue from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (stored) {
        setQueue(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load offline queue:", e);
    }
  }, []);

  // Save queue to localStorage whenever it changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error("Failed to save offline queue:", e);
    }
  }, [queue]);

  // Process queue: execute each operation in order, remove successful ones
  const processQueue = useCallback(async () => {
    if (isProcessing) return;

    setIsProcessing(true);
    try {
      // Read the current queue from state
      const currentQueue = [...queue].sort((a, b) => a.timestamp - b.timestamp);
      const failedOps: QueuedOperation[] = [];

      for (const op of currentQueue) {
        try {
          const { type, data } = op;
          const storage = (data.source === "supabase" ? "supabase" : "redis") as "redis" | "supabase";

          switch (type) {
            case "create":
              await noteOperation(storage, {
                operation: "create",
                userId: data.userId,
                note: data.note,
              });
              break;
            case "update":
              await noteOperation(storage, {
                operation: "update",
                userId: data.userId,
                noteId: op.noteId,
                content: data.content,
                goal: data.goal,
                goalType: data.goalType,
              });
              break;
            case "updateTitle":
              await noteOperation(storage, {
                operation: "updateTitle",
                userId: data.userId,
                noteId: op.noteId,
                title: data.title,
              });
              break;
            case "updatePin":
              await noteOperation(storage, {
                operation: "updatePin",
                userId: data.userId,
                noteId: op.noteId,
                isPinned: data.isPinned,
              });
              break;
            case "updatePrivacy":
              await noteOperation(storage, {
                operation: "updatePrivacy",
                userId: data.userId,
                noteId: op.noteId,
                isPrivate: data.isPrivate,
              });
              break;
            case "delete":
              await noteOperation(storage, {
                operation: "delete",
                userId: data.userId,
                noteId: op.noteId,
              });
              break;
          }
        } catch (error) {
          console.error(`Failed to process queued operation ${op.id}:`, error);
          failedOps.push(op);
        }
      }

      // Keep only failed operations in the queue
      setQueue(failedOps);
    } finally {
      setIsProcessing(false);
    }
  }, [queue, isProcessing]);

  // Process queue when transitioning from offline to online
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    const isNowOnline = isOnline;
    prevOnlineRef.current = isOnline;

    if (wasOffline && isNowOnline && queue.length > 0) {
      processQueue();
    }
  }, [isOnline, queue.length, processQueue]);

  // Add operation to queue
  const addToQueue = useCallback((operation: Omit<QueuedOperation, "id" | "timestamp">) => {
    const newOp: QueuedOperation = {
      ...operation,
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    setQueue((prev) => {
      // Deduplicate: remove older operations for the same note/type
      const filtered = prev.filter(
        (op) => !(op.noteId === newOp.noteId && op.type === newOp.type)
      );
      return [...filtered, newOp];
    });

    return newOp.id;
  }, []);

  // Remove operation from queue
  const removeFromQueue = useCallback((operationId: string) => {
    setQueue((prev) => prev.filter((op) => op.id !== operationId));
  }, []);

  // Clear entire queue
  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  // Get pending operations count
  const pendingCount = queue.length;

  return {
    queue,
    addToQueue,
    removeFromQueue,
    clearQueue,
    pendingCount,
    isProcessing,
    isOnline,
    processQueue,
  };
}
