"use client";

import { useAnalyticsConsent } from "@/hooks/use-analytics-consent";
import { X } from "lucide-react";

/**
 * Cookie/Analytics consent banner
 *
 * Shows at the bottom of the screen when user hasn't made a consent choice.
 * Provides options to accept or decline analytics tracking.
 */
export function ConsentBanner() {
  const {
    isPending,
    isLoaded,
    acceptAnalytics,
    declineAnalytics,
  } = useAnalyticsConsent();

  // Don't show until we've loaded consent state from localStorage
  if (!isLoaded) return null;

  // Don't show if user has already made a choice
  if (!isPending) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 print:hidden">
      <div className="mx-auto max-w-2xl bg-white rounded-lg shadow-lg border border-neutral-200 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="font-semibold text-neutral-900 mb-1">
              We value your privacy
            </h3>
            <p className="text-sm text-neutral-600">
              We use analytics tools (LogRocket and Google Analytics) to improve your
              experience. This includes session recordings and usage data.{" "}
              <a
                href="/privacy-policy"
                className="text-blue-600 hover:underline"
              >
                Learn more
              </a>
            </p>
          </div>
          <button
            onClick={declineAnalytics}
            className="text-neutral-400 hover:text-neutral-600 p-1"
            aria-label="Decline"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={declineAnalytics}
            className="px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-md hover:bg-neutral-200 transition-colors"
          >
            Decline
          </button>
          <button
            onClick={acceptAnalytics}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            Accept Analytics
          </button>
        </div>
      </div>
    </div>
  );
}
