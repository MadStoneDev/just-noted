"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Hook for managing screen reader announcements
 * Creates a live region that announces changes to screen readers
 */
export function useAnnounce() {
  const announcerRef = useRef<HTMLDivElement | null>(null);

  // Create announcer element on mount
  useEffect(() => {
    if (typeof document === "undefined") return;

    // Check if announcer already exists
    let announcer = document.getElementById("sr-announcer") as HTMLDivElement;

    if (!announcer) {
      announcer = document.createElement("div");
      announcer.id = "sr-announcer";
      announcer.setAttribute("role", "status");
      announcer.setAttribute("aria-live", "polite");
      announcer.setAttribute("aria-atomic", "true");
      announcer.className = "sr-only";
      // Visually hidden but accessible
      announcer.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      `;
      document.body.appendChild(announcer);
    }

    announcerRef.current = announcer;

    return () => {
      // Don't remove on unmount - other components might use it
    };
  }, []);

  // Announce a message to screen readers
  const announce = useCallback((message: string, priority: "polite" | "assertive" = "polite") => {
    if (!announcerRef.current) return;

    // Change aria-live based on priority
    announcerRef.current.setAttribute("aria-live", priority);

    // Clear and set new message (triggers announcement)
    announcerRef.current.textContent = "";
    // Use setTimeout to ensure the clear is processed first
    setTimeout(() => {
      if (announcerRef.current) {
        announcerRef.current.textContent = message;
      }
    }, 50);
  }, []);

  return { announce };
}

/**
 * Hook for focus trapping within a modal/dialog
 */
export function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive) return;

    const container = containerRef.current;
    if (!container) return;

    // Store the currently focused element
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable element
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // Handle tab key to trap focus
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );

      if (focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: if on first element, go to last
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: if on last element, go to first
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus when closing
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isActive]);

  return containerRef;
}

/**
 * Hook for announcing save status changes
 */
export function useSaveAnnouncements() {
  const { announce } = useAnnounce();

  const announceSaving = useCallback(() => {
    announce("Saving note...");
  }, [announce]);

  const announceSaved = useCallback(() => {
    announce("Note saved successfully");
  }, [announce]);

  const announceError = useCallback((message?: string) => {
    announce(message || "Failed to save note", "assertive");
  }, [announce]);

  return {
    announceSaving,
    announceSaved,
    announceError,
  };
}

/**
 * Skip link component for keyboard navigation
 */
export function SkipLinks() {
  return (
    <div className="sr-only focus-within:not-sr-only">
      <a
        href="#main-content"
        className="absolute top-2 left-2 z-[100] px-4 py-2 bg-mercedes-primary text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-mercedes-primary"
      >
        Skip to main content
      </a>
      <a
        href="#notes-list"
        className="absolute top-2 left-40 z-[100] px-4 py-2 bg-mercedes-primary text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-mercedes-primary"
      >
        Skip to notes
      </a>
    </div>
  );
}
