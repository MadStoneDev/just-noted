"use client";

import React from "react";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import LogRocket from "logrocket";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class NotesErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console for debugging
    console.error("Notes Error Boundary caught an error:", error, errorInfo);

    // Log to LogRocket
    try {
      LogRocket.captureException(error, {
        extra: {
          componentStack:
            errorInfo.componentStack || "No component stack available",
          errorBoundary: "NotesErrorBoundary",
        },
      });
    } catch (logRocketError) {
      console.error("Failed to log error to LogRocket:", logRocketError);
    }

    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-orange-100 rounded-full">
                <IconAlertTriangle
                  size={48}
                  className="text-orange-600"
                  strokeWidth={1.5}
                />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-semibold text-neutral-900 mb-2">
              Oops! Something went wrong
            </h2>

            {/* Description */}
            <p className="text-neutral-600 mb-6">
              Don't worry — your notes are safe and automatically saved. Try
              refreshing the page to continue where you left off.
            </p>

            {/* Technical details - only in development */}
            {process.env.NODE_ENV === "development" && this.state.error && (
              <details className="mb-6 text-left">
                <summary className="text-sm text-neutral-500 cursor-pointer hover:text-neutral-700 mb-2">
                  Developer Info (hidden in production)
                </summary>
                <div className="p-4 bg-neutral-100 rounded-lg">
                  <p className="text-xs font-mono text-neutral-700 break-all mb-2">
                    <strong>Error:</strong> {this.state.error.message}
                  </p>
                  {this.state.errorInfo && (
                    <pre className="text-xs text-neutral-600 overflow-auto max-h-32">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}

            {/* Action button */}
            <button
              onClick={this.handleReset}
              className="w-full px-6 py-3 bg-mercedes-primary hover:bg-mercedes-primary/90 text-white rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2"
            >
              <IconRefresh size={20} strokeWidth={1.5} />
              Refresh Page
            </button>

            {/* Help text */}
            <p className="text-sm text-neutral-500 mt-4">
              If this keeps happening, please contact support
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
