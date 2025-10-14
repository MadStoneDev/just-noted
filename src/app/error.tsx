"use client";

import React, { useEffect } from "react";
import { IconAlertTriangle, IconRefresh, IconHome } from "@tabler/icons-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-neutral-200 flex items-center justify-center px-4">
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
            Something went wrong
          </h1>

          {/* Description */}
          <p className="text-neutral-600 mb-6">
            We encountered an unexpected error. Don't worry, your notes are
            safe. Try refreshing the page or return home.
          </p>

          {/* Error details (only in development) */}
          {process.env.NODE_ENV === "development" && (
            <div className="mb-6 p-4 bg-neutral-100 rounded-lg text-left">
              <p className="text-xs font-mono text-neutral-700 break-all">
                {error.message}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={reset}
              className="px-6 py-3 bg-mercedes-primary hover:bg-mercedes-primary/90 text-white rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2"
            >
              <IconRefresh size={20} strokeWidth={1.5} />
              Try Again
            </button>

            <a
              href="/"
              className="px-6 py-3 bg-white hover:bg-neutral-50 text-neutral-900 border border-neutral-300 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2"
            >
              <IconHome size={20} strokeWidth={1.5} />
              Go Home
            </a>
          </div>
        </div>

        {/* Additional help text */}
        <p className="text-center text-sm text-neutral-600 mt-4">
          If this problem persists, please contact support
        </p>
      </div>
    </div>
  );
}
