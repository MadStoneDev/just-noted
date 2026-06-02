"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import {
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconInfoCircle,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, opts?: { duration?: number; action?: Toast["action"] }) => void;
  success: (message: string) => void;
  error: (message: string, action?: Toast["action"]) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastType = "info", opts?: { duration?: number; action?: Toast["action"] }) => {
      const id = crypto.randomUUID();
      const duration = opts?.duration ?? (type === "error" ? 6000 : 3500);

      setToasts((prev) => [...prev, { id, type, message, action: opts?.action }]);

      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const ctx: ToastContextType = {
    toast: addToast,
    success: (msg) => addToast(msg, "success"),
    error: (msg, action) => addToast(msg, "error", { action }),
    warning: (msg) => addToast(msg, "warning"),
    info: (msg) => addToast(msg, "info"),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {toasts.length > 0 && (
        <div
          className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
          role="region"
          aria-label="Notifications"
        >
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onRemove={remove} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const toastConfig: Record<
  ToastType,
  { icon: React.ReactNode; className: string }
> = {
  success: {
    icon: <IconCheck size={18} />,
    className:
      "bg-[var(--color-bg-elevated)] border-[var(--color-success)] text-[var(--color-text-primary)] [&_[data-icon]]:text-[var(--color-success)]",
  },
  error: {
    icon: <IconX size={18} />,
    className:
      "bg-[var(--color-bg-elevated)] border-[var(--color-danger)] text-[var(--color-text-primary)] [&_[data-icon]]:text-[var(--color-danger)]",
  },
  warning: {
    icon: <IconAlertTriangle size={18} />,
    className:
      "bg-[var(--color-bg-elevated)] border-[var(--color-warning)] text-[var(--color-text-primary)] [&_[data-icon]]:text-[var(--color-warning)]",
  },
  info: {
    icon: <IconInfoCircle size={18} />,
    className:
      "bg-[var(--color-bg-elevated)] border-[var(--color-accent)] text-[var(--color-text-primary)] [&_[data-icon]]:text-[var(--color-accent)]",
  },
};

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast;
  onRemove: (id: string) => void;
}) {
  const config = toastConfig[toast.type];

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-[var(--radius-lg)] border-l-[3px] shadow-lg animate-slide-in-right",
        config.className,
      )}
      role="alert"
    >
      <span data-icon className="mt-0.5 shrink-0">
        {config.icon}
      </span>
      <span className="flex-1 text-sm leading-snug">{toast.message}</span>
      {toast.action && (
        <button
          onClick={toast.action.onClick}
          className="shrink-0 text-sm font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
        >
          {toast.action.label}
        </button>
      )}
      <IconButton
        label="Dismiss"
        size="sm"
        className="shrink-0 -mr-1 -mt-0.5"
        onClick={() => onRemove(toast.id)}
      >
        <IconX size={14} />
      </IconButton>
    </div>
  );
}
