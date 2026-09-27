"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";

// Note title as an auto-growing textarea (wraps long titles instead of
// truncating), matching the standard editor. Shared so shared-note views and the
// editor render the title identically.
export default function AutoGrowTitle({
  value,
  onChange,
  placeholder = "Untitled",
  readOnly = false,
  className = "",
}: {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const grow = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Grow on mount and whenever the value changes (e.g. after the note loads).
  useLayoutEffect(() => {
    if (ref.current) grow(ref.current);
  }, [value, grow]);

  // Re-measure on width changes. A single mount-time measure can land while the
  // view is still animating in at a near-zero width, wrapping the title into
  // many lines and locking in a huge height that never corrects. Gated on width
  // so our own height writes don't loop the observer.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w !== lastWidth) {
        lastWidth = w;
        grow(el);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [grow]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      readOnly={readOnly}
      onChange={
        onChange
          ? (e) => {
              onChange(e.target.value);
              grow(e.target);
            }
          : undefined
      }
      placeholder={placeholder}
      spellCheck={false}
      className={`w-full resize-none overflow-hidden bg-transparent font-[family-name:var(--font-editor)] text-[32px] md:text-[46px] leading-[1.1] font-medium tracking-[-0.015em] text-[var(--color-ink)] placeholder:text-[var(--color-ink-6)] focus:outline-none ${className}`}
    />
  );
}
