"use client";

import React, { useEffect } from "react";
import { IconAlertTriangle, IconRefresh, IconHome } from "@tabler/icons-react";
import LogRocket from "logrocket";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Application error:", error);

    try {
      LogRocket.captureException(error, {
        tags: { errorType: "page-error" },
        extra: {
          digest: error.digest || "No digest",
          errorPage: "error.tsx",
          errorMessage: error.message,
        },
      });
    } catch {}
  }, [error]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <div className="flex justify-center mb-5">
          <div className="p-3 bg-[var(--color-danger-subtle)] rounded-full">
            <IconAlertTriangle size={32} className="text-[var(--color-danger)]" strokeWidth={1.5} />
          </div>
        </div>

        <h1 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
          Something went wrong
        </h1>

        <p className="text-sm text-[var(--color-text-secondary)] mb-6 leading-relaxed">
          We hit an unexpected error. Your notes are safe — try refreshing.
        </p>

        {process.env.NODE_ENV === "development" && (
          <div className="mb-6 p-3 bg-[var(--color-bg-tertiary)] rounded-[var(--radius-md)] text-left">
            <p className="text-xs font-mono text-[var(--color-text-secondary)] break-all">
              {error.message}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-text-on-accent)] rounded-[var(--radius-md)] text-sm font-medium transition-colors duration-[var(--duration-fast)] flex items-center justify-center gap-2"
          >
            <IconRefresh size={16} strokeWidth={1.5} />
            Try Again
          </button>

          <a
            href="/"
            className="px-4 py-2.5 bg-[var(--color-bg-primary)] hover:bg-[var(--color-hover)] text-[var(--color-text-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] text-sm font-medium transition-colors duration-[var(--duration-fast)] flex items-center justify-center gap-2"
          >
            <IconHome size={16} strokeWidth={1.5} />
            Go Home
          </a>
        </div>

        <p className="text-xs text-[var(--color-text-tertiary)] mt-6">
          If this persists, please contact support
        </p>
      </div>
    </div>
  );
}
