"use client";

import { useEffect, useRef } from "react";

// Minimal typing for the Cloudflare Turnstile browser API.
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      // Don't cache the failure — allow a later remount to retry the load,
      // otherwise a single network blip disables the captcha until reload.
      scriptPromise = null;
      s.remove();
      reject(new Error("Failed to load Turnstile"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

interface TurnstileProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  theme?: "auto" | "light" | "dark";
  className?: string;
}

/**
 * Cloudflare Turnstile widget. Remount with a changing `key` to get a fresh
 * token — Turnstile tokens are single-use, so reset it after each submit.
 */
export default function Turnstile({
  siteKey,
  onVerify,
  onExpire,
  onError,
  theme = "auto",
  className,
}: TurnstileProps) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // Always call the latest callbacks without re-rendering the widget.
  const cb = useRef({ onVerify, onExpire, onError });
  cb.current = { onVerify, onExpire, onError };

  useEffect(() => {
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        if (widgetId.current) return;
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          theme,
          callback: (token: string) => cb.current.onVerify(token),
          "expired-callback": () => cb.current.onExpire?.(),
          "error-callback": () => cb.current.onError?.(),
        });
      })
      .catch(() => cb.current.onError?.());

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          // widget already gone
        }
        widgetId.current = null;
      }
    };
  }, [siteKey, theme]);

  return <div ref={ref} className={className} />;
}
