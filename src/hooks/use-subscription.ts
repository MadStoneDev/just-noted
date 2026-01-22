"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Subscription,
  SubscriptionTier,
  SubscriptionLimits,
  SUBSCRIPTION_LIMITS,
} from "@/types/subscription";

interface UseSubscriptionReturn {
  subscription: Subscription | null;
  isLoading: boolean;
  error: string | null;
  limits: SubscriptionLimits;
  tier: SubscriptionTier;
  isPro: boolean;
  isTeam: boolean;
  canUseFeature: (feature: keyof SubscriptionLimits) => boolean;
  refreshSubscription: () => Promise<void>;
}

// Local storage key for caching subscription data
const SUBSCRIPTION_CACHE_KEY = "justnoted_subscription";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Hook for managing user subscription state
 */
export function useSubscription(userId: string | null): UseSubscriptionReturn {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch subscription from API
  const fetchSubscription = useCallback(async () => {
    if (!userId) {
      setSubscription(null);
      setIsLoading(false);
      return;
    }

    // Check cache first
    try {
      const cached = localStorage.getItem(SUBSCRIPTION_CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION && data.userId === userId) {
          setSubscription(data);
          setIsLoading(false);
          // Still refresh in background
        }
      }
    } catch {
      // Ignore cache errors
    }

    try {
      const response = await fetch(`/api/subscription?userId=${userId}`);

      if (!response.ok) {
        if (response.status === 404) {
          // No subscription = free tier
          const freeSubscription: Subscription = {
            userId,
            tier: "free",
            status: "active",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          setSubscription(freeSubscription);
          return;
        }
        throw new Error("Failed to fetch subscription");
      }

      const data = await response.json();
      setSubscription(data.subscription);

      // Cache the result
      localStorage.setItem(
        SUBSCRIPTION_CACHE_KEY,
        JSON.stringify({ data: data.subscription, timestamp: Date.now() })
      );
    } catch (err) {
      console.error("Subscription fetch error:", err);
      setError("Failed to load subscription status");
      // Default to free tier on error
      setSubscription({
        userId,
        tier: "free",
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Fetch on mount and when userId changes
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Derived values
  const tier: SubscriptionTier = subscription?.tier || "free";
  const limits = SUBSCRIPTION_LIMITS[tier];
  const isPro = tier === "pro" || tier === "team";
  const isTeam = tier === "team";

  // Check if user can use a specific feature
  const canUseFeature = useCallback(
    (feature: keyof SubscriptionLimits): boolean => {
      const value = limits[feature];
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value !== 0;
      return false;
    },
    [limits]
  );

  return {
    subscription,
    isLoading,
    error,
    limits,
    tier,
    isPro,
    isTeam,
    canUseFeature,
    refreshSubscription: fetchSubscription,
  };
}

/**
 * Get Paddle checkout URL for upgrading
 */
export function getPaddleCheckoutUrl(
  userId: string,
  tier: "pro" | "team",
  email?: string
): string {
  const priceId = tier === "pro"
    ? process.env.NEXT_PUBLIC_PADDLE_PRO_PRICE_ID
    : process.env.NEXT_PUBLIC_PADDLE_TEAM_PRICE_ID;

  // This would be your Paddle checkout link
  // In production, you'd generate this via Paddle's API
  const baseUrl = "https://checkout.paddle.com/checkout/custom-checkout";
  const params = new URLSearchParams({
    product: priceId || "",
    passthrough: JSON.stringify({ userId }),
    ...(email && { email }),
  });

  return `${baseUrl}?${params.toString()}`;
}
