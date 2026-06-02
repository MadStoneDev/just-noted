"use client";

import { useAnalyticsConsent } from "@/hooks/use-analytics-consent";
import { IconX } from "@tabler/icons-react";

export function ConsentBanner() {
  const {
    isPending,
    isLoaded,
    acceptAnalytics,
    declineAnalytics,
  } = useAnalyticsConsent();

  if (!isLoaded) return null;
  if (!isPending) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 print:hidden">
      <div className="mx-auto max-w-lg bg-[var(--color-bg-elevated)] rounded-[var(--radius-lg)] shadow-lg border border-[var(--color-border-primary)] p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
              We value your privacy
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              We use analytics to improve your experience.{" "}
              <a
                href="/privacy-policy"
                className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] underline"
              >
                Learn more
              </a>
            </p>
          </div>
          <button
            onClick={declineAnalytics}
            className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label="Decline"
          >
            <IconX size={16} />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={declineAnalytics}
            className="px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] rounded-[var(--radius-md)] hover:bg-[var(--color-active)] transition-colors"
          >
            Decline
          </button>
          <button
            onClick={acceptAnalytics}
            className="px-3 py-1.5 text-xs font-medium text-[var(--color-text-on-accent)] bg-[var(--color-accent)] rounded-[var(--radius-md)] hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
