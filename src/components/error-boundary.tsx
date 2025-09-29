"use client";

import React from "react";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class NotesErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Notes Error Boundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="max-w-md w-full bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <IconAlertCircle
                className="text-red-600 flex-shrink-0"
                size={24}
              />
              <div className="flex-grow">
                <h2 className="text-lg font-semibold text-red-900 mb-2">
                  Something went wrong
                </h2>
                <p className="text-sm text-red-700 mb-4">
                  We encountered an error while loading your notes. Your data is
                  safe, but you may need to refresh the page.
                </p>
                {this.state.error && (
                  <details className="mb-4">
                    <summary className="text-xs text-red-600 cursor-pointer hover:underline">
                      Technical details
                    </summary>
                    <pre className="mt-2 text-xs bg-red-100 p-2 rounded overflow-auto">
                      {this.state.error.message}
                    </pre>
                  </details>
                )}
                <button
                  onClick={this.handleReset}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  <IconRefresh size={18} />
                  Refresh Page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
