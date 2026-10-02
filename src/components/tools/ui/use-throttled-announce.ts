"use client";

import { useEffect, useRef, useState } from "react";

// Returns a copy of `value` that updates at most once per `ms`, for feeding an
// aria-live region so fast-changing output (a slug as you type, live counts)
// doesn't flood screen readers (spec §10: one announcement per 1s).
export function useThrottledAnnounce(value: string, ms = 1000): string {
  const [announced, setAnnounced] = useState(value);
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - last.current;
    if (elapsed >= ms) {
      last.current = now;
      setAnnounced(value);
    } else {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        last.current = Date.now();
        setAnnounced(value);
      }, ms - elapsed);
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, ms]);

  return announced;
}
