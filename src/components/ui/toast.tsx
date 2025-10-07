// src/components/ui/toast.tsx
"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import {
  IconCheck,
  IconX,
  IconAlertCircle,
  IconInfoCircle,
} from "@tabler/icons-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showWarning: (message: string) => void;
  showInfo: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", duration = 3000) => {
      const id = Date.now().toString();
      const toast: Toast = { id, type, message, duration };

      setToasts((prev) => [...prev, toast]);

      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
    },
    [],
  );

  const showSuccess = useCallback(
    (message: string) => showToast(message, "success"),
    [showToast],
  );

  const showError = useCallback(
    (message: string) => showToast(message, "error", 5000),
    [showToast],
  );

  const showWarning = useCallback(
    (message: string) => showToast(message, "warning"),
    [showToast],
  );

  const showInfo = useCallback(
    (message: string) => showToast(message, "info"),
    [showToast],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider
      value={{ showToast, showSuccess, showError, showWarning, showInfo }}
    >
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast;
  onRemove: (id: string) => void;
}) {
  const icons = {
    success: <IconCheck size={20} />,
    error: <IconX size={20} />,
    warning: <IconAlertCircle size={20} />,
    info: <IconInfoCircle size={20} />,
  };

  const colors = {
    success: "bg-green-500 text-white",
    error: "bg-red-500 text-white",
    warning: "bg-orange-500 text-white",
    info: "bg-blue-500 text-white",
  };

  return (
    <div
      className={`${
        colors[toast.type]
      } px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] animate-slide-in-right`}
    >
      {icons[toast.type]}
      <span className="flex-grow">{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        className="hover:opacity-80 transition-opacity"
        aria-label="Close notification"
      >
        <IconX size={16} />
      </button>
    </div>
  );
}
