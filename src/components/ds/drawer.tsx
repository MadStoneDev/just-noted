"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";
import { Button } from "./button";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  /** Optional sticky action bar rendered below the scrollable body. */
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "full";
  className?: string;
  /**
   * When false, Escape / backdrop / the close button won't dismiss the drawer
   * (e.g. while a save is in flight). Defaults to true.
   */
  dismissable?: boolean;
}

const sizeClasses: Record<NonNullable<DrawerProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  full: "max-w-none", // edge-to-edge, no width cap
};

/**
 * A full-width, modern bottom-sheet drawer. Slides up from the bottom, sized to
 * its content, centered on wide screens. Provides focus trapping, Escape-to-close,
 * body-scroll lock, backdrop dismissal, and restores focus on close — the a11y the
 * original one-off add-shared drawer lacked. Put arbitrary content in `children`;
 * put sticky actions in `footer`.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  dismissable = true,
}: DrawerProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // `rendered` keeps the node mounted through the slide-out; `visible` drives the
  // enter/leave transform so it animates in both directions.
  const [rendered, setRendered] = useState(open);
  const [visible, setVisible] = useState(false);

  const requestClose = useCallback(() => {
    if (dismissable) onClose();
  }, [dismissable, onClose]);

  useEffect(() => {
    if (open) {
      setRendered(true);
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true)),
      );
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const timer = setTimeout(() => setRendered(false), 300);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement;
    document.body.style.overflow = "hidden";

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        requestClose();
        return;
      }
      if (e.key !== "Tab" || !contentRef.current) return;

      const focusable = contentRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);

    requestAnimationFrame(() => {
      const firstField = contentRef.current?.querySelector<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      firstField?.focus();
    });

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
      previousFocusRef.current?.focus();
    };
  }, [open, requestClose]);

  if (!rendered) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "drawer-title" : undefined}
      aria-describedby={description ? "drawer-description" : undefined}
    >
      <div
        className={cn(
          "absolute inset-0 bg-[var(--color-bg-overlay)] transition-opacity duration-[var(--duration-normal)]",
          visible ? "opacity-100" : "opacity-0",
        )}
        onClick={requestClose}
      />

      <div
        ref={contentRef}
        className={cn(
          "relative w-full flex flex-col max-h-[85vh] bg-[var(--color-bg-elevated)] border-t border-[var(--color-border-primary)] rounded-t-[var(--radius-xl)] shadow-[var(--shadow-lg)] transition-transform duration-[var(--duration-slow)]",
          visible ? "translate-y-0" : "translate-y-full",
          sizeClasses[size],
          className,
        )}
        style={{ transitionTimingFunction: "var(--ease-spring)" }}
      >
        {/* Grab handle */}
        <div className="mx-auto mt-2.5 mb-1 h-1 w-10 shrink-0 rounded-full bg-[var(--color-border-primary)]" />

        {title && (
          <div className="flex items-center justify-between gap-3 px-5 py-3 shrink-0">
            <div className="min-w-0">
              <h3
                id="drawer-title"
                className="truncate text-base font-semibold text-[var(--color-text-primary)]"
              >
                {title}
              </h3>
              {description && (
                <p
                  id="drawer-description"
                  className="mt-0.5 text-sm text-[var(--color-text-secondary)]"
                >
                  {description}
                </p>
              )}
            </div>
            {dismissable && (
              <IconButton label="Close" size="sm" onClick={onClose}>
                <IconX size={18} />
              </IconButton>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-5 pb-5 pt-1">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-[var(--color-border-secondary)] px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmDrawerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  loading?: boolean;
}

/** Drop-in replacement for ConfirmModal, rendered as a bottom-sheet drawer. */
export function ConfirmDrawer({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive = false,
  loading = false,
}: ConfirmDrawerProps) {
  return (
    <Drawer open={open} onClose={onClose} title={title} size="sm" dismissable={!loading}>
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-text-secondary)]">{message}</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" size="md" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            size="md"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
