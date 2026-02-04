"use client";

import { useState, useEffect, useCallback } from "react";

const CONSENT_KEY = "analytics-consent";

export type ConsentStatus = "pending" | "accepted" | "declined";

interface ConsentState {
  status: ConsentStatus;
  timestamp?: number;
}

/**
 * Hook to manage analytics consent (LogRocket, Google Analytics)
 *
 * Stores consent in localStorage to persist across sessions.
 * Returns pending if user hasn't made a choice yet.
 */
export function useAnalyticsConsent() {
  const [consent, setConsent] = useState<ConsentState>({ status: "pending" });
  const [isLoaded, setIsLoaded] = useState(false);

  // Load consent state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ConsentState;
        setConsent(parsed);
      }
    } catch {
      // localStorage not available or parsing failed
    }
    setIsLoaded(true);
  }, []);

  // Accept analytics
  const acceptAnalytics = useCallback(() => {
    const newState: ConsentState = {
      status: "accepted",
      timestamp: Date.now(),
    };
    setConsent(newState);
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(newState));
    } catch {
      // localStorage not available
    }
  }, []);

  // Decline analytics
  const declineAnalytics = useCallback(() => {
    const newState: ConsentState = {
      status: "declined",
      timestamp: Date.now(),
    };
    setConsent(newState);
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(newState));
    } catch {
      // localStorage not available
    }
  }, []);

  // Reset consent (for settings page)
  const resetConsent = useCallback(() => {
    setConsent({ status: "pending" });
    try {
      localStorage.removeItem(CONSENT_KEY);
    } catch {
      // localStorage not available
    }
  }, []);

  return {
    status: consent.status,
    isLoaded,
    hasConsented: consent.status === "accepted",
    hasDeclined: consent.status === "declined",
    isPending: consent.status === "pending",
    acceptAnalytics,
    declineAnalytics,
    resetConsent,
    consentTimestamp: consent.timestamp,
  };
}
