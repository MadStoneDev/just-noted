"use client";

import { initializePaddle, type Paddle } from "@paddle/paddle-js";

let paddlePromise: Promise<Paddle | undefined> | null = null;

function getPaddle(): Promise<Paddle | undefined> {
  if (!paddlePromise) {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    if (!token) return Promise.resolve(undefined);
    paddlePromise = initializePaddle({
      token,
      environment: (process.env.NEXT_PUBLIC_PADDLE_ENV as "sandbox" | "production") || "sandbox",
    });
  }
  return paddlePromise;
}

export function paddleConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
}

/**
 * Open the Paddle overlay checkout for a plan. customData.userId is what the
 * webhook (api/webhooks/paddle) reads to map the subscription to this account.
 * Returns false if Paddle isn't configured.
 */
export async function openUpgradeCheckout(opts: {
  tier: "pro" | "team";
  email?: string;
  userId: string;
}): Promise<boolean> {
  const paddle = await getPaddle();
  if (!paddle) return false;
  const priceId =
    opts.tier === "team"
      ? process.env.NEXT_PUBLIC_PADDLE_TEAM_PRICE_ID
      : process.env.NEXT_PUBLIC_PADDLE_PRO_PRICE_ID;
  if (!priceId) return false;
  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: opts.email ? { email: opts.email } : undefined,
    customData: { userId: opts.userId },
    settings: { displayMode: "overlay", theme: "dark", allowLogout: false },
  });
  return true;
}
