"use client";

import React, { useRef, useState, useEffect, ReactNode } from "react";

interface LazyNoteRenderProps {
  children: ReactNode;
  placeholder?: ReactNode;
  rootMargin?: string;
  threshold?: number;
}

/**
 * Lazy render wrapper that only renders children when the element
 * is about to enter the viewport. Uses IntersectionObserver for
 * efficient detection without scroll event listeners.
 *
 * Once rendered, the content stays rendered (no unloading).
 */
export default function LazyNoteRender({
  children,
  placeholder,
  rootMargin = "200px", // Start rendering 200px before visible
  threshold = 0,
}: LazyNoteRenderProps) {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // Check if IntersectionObserver is available
    if (typeof IntersectionObserver === "undefined") {
      // Fallback: render immediately if IntersectionObserver not supported
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            // Once visible, disconnect observer (content stays rendered)
            observer.disconnect();
          }
        });
      },
      {
        rootMargin,
        threshold,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [rootMargin, threshold]);

  // Default placeholder
  const defaultPlaceholder = (
    <div className="animate-pulse bg-neutral-100 rounded-xl p-4 min-h-[200px] flex items-center justify-center">
      <div className="text-neutral-400">Loading note...</div>
    </div>
  );

  return (
    <div ref={containerRef}>
      {isVisible ? children : (placeholder || defaultPlaceholder)}
    </div>
  );
}

/**
 * Hook for batch lazy rendering with staggered loading
 * Useful when you want to control loading order/timing
 */
export function useLazyRenderBatch(totalItems: number, batchSize: number = 5) {
  const [visibleCount, setVisibleCount] = useState(batchSize);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element || visibleCount >= totalItems) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisibleCount(totalItems);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + batchSize, totalItems));
        }
      },
      {
        rootMargin: "400px",
        threshold: 0,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [visibleCount, totalItems, batchSize]);

  return {
    visibleCount,
    loadMoreRef,
    hasMore: visibleCount < totalItems,
  };
}
