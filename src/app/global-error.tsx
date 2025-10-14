"use client";

import React, { useEffect } from "react";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import LogRocket from "logrocket";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Log the error to console
    console.error("Global application error:", error);

    // Log to LogRocket
    try {
      LogRocket.captureException(error, {
        tags: {
          errorType: "global-error",
          critical: "true",
        },
        extra: {
          digest: error.digest || "No digest",
          errorPage: "global-error.tsx",
          severity: "critical",
          errorMessage: error.message,
        },
      });
    } catch (logRocketError) {
      console.error("Failed to log error to LogRocket:", logRocketError);
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-neutral-200 min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-red-100 rounded-full">
                <IconAlertTriangle
                  size={48}
                  className="text-red-600"
                  strokeWidth={1.5}
                />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
              Critical Error
            </h1>

            {/* Description */}
            <p className="text-neutral-600 mb-6">
              The application encountered a critical error. Please try
              refreshing the page. Your notes are automatically saved and will
              be restored.
            </p>

            {/* Action button */}
            <button
              onClick={reset}
              className="w-full px-6 py-3 bg-mercedes-primary hover:bg-mercedes-primary/90 text-white rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2"
            >
              <IconRefresh size={20} strokeWidth={1.5} />
              Reload Application
            </button>

            {/* Additional help */}
            <p className="text-center text-sm text-neutral-600 mt-6">
              If reloading doesn't help, try clearing your browser cache
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
