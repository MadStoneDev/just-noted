"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useInteractions,
  useRole,
  FloatingPortal,
  type Placement,
} from "@floating-ui/react";
import { cn } from "@/lib/utils";

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  placement?: Placement;
  className?: string;
}

export function Dropdown({
  trigger,
  children,
  placement = "bottom-start",
  className,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context, isPositioned } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
    role,
  ]);

  return (
    <>
      <div ref={refs.setReference} {...getReferenceProps()}>
        {trigger}
      </div>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className={cn(
              "z-50 min-w-[180px] py-1 bg-[var(--color-bg-elevated)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] transition-opacity duration-[var(--duration-fast)]",
              isPositioned ? "opacity-100" : "opacity-0",
              className,
            )}
          >
            {children}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

interface DropdownItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  destructive?: boolean;
  icon?: React.ReactNode;
}

export function DropdownItem({
  children,
  destructive,
  icon,
  className,
  ...props
}: DropdownItemProps) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors outline-none cursor-pointer",
        destructive
          ? "text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)]"
          : "text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]",
        "focus-visible:bg-[var(--color-hover)]",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      role="menuitem"
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return (
    <div className="my-1 h-px bg-[var(--color-border-secondary)]" role="separator" />
  );
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 text-xs font-medium text-[var(--color-text-tertiary)]">
      {children}
    </div>
  );
}
