"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "outline" | "filled";
  label: string;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = "md", variant = "ghost", label, children, ...props }, ref) => {
    const sizeClasses = {
      sm: "size-8 [&_svg]:size-4",
      md: "size-9 [&_svg]:size-[18px]",
      lg: "size-10 [&_svg]:size-5",
    };

    const variantClasses = {
      ghost:
        "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]",
      outline:
        "border border-[var(--color-border-primary)] bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]",
      filled:
        "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-active)] hover:text-[var(--color-text-primary)]",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-[var(--radius-md)] transition-colors duration-[var(--duration-fast)] disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)] cursor-pointer",
          sizeClasses[size],
          variantClasses[variant],
          className,
        )}
        aria-label={label}
        title={label}
        {...props}
      >
        {children}
      </button>
    );
  },
);
IconButton.displayName = "IconButton";

export { IconButton };
