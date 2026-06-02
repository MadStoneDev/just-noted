"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap font-medium transition-colors [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-accent-subtle)] text-[var(--color-accent)] border border-transparent",
        secondary:
          "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border border-transparent",
        outline:
          "bg-transparent text-[var(--color-text-secondary)] border border-[var(--color-border-primary)]",
        success:
          "bg-[var(--color-success-subtle)] text-[var(--color-success)] border border-transparent",
        warning:
          "bg-[var(--color-warning-subtle)] text-[var(--color-warning)] border border-transparent",
        danger:
          "bg-[var(--color-danger-subtle)] text-[var(--color-danger)] border border-transparent",
      },
      size: {
        sm: "text-[10px] px-1.5 py-0.5 rounded-[var(--radius-sm)]",
        md: "text-xs px-2 py-0.5 rounded-[var(--radius-md)]",
        lg: "text-sm px-2.5 py-1 rounded-[var(--radius-md)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
