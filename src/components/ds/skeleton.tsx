"use client";

import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "lg" | "full";
}

export function Skeleton({
  className,
  width,
  height,
  rounded = "md",
}: SkeletonProps) {
  const roundedClasses = {
    sm: "rounded-[var(--radius-sm)]",
    md: "rounded-[var(--radius-md)]",
    lg: "rounded-[var(--radius-lg)]",
    full: "rounded-full",
  };

  return (
    <div
      className={cn("skeleton", roundedClasses[rounded], className)}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={14}
          width={i === lines - 1 ? "60%" : "100%"}
        />
      ))}
    </div>
  );
}

export function SkeletonNote({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3 p-4", className)} aria-hidden="true">
      <Skeleton height={20} width="40%" />
      <SkeletonText lines={3} />
      <div className="flex gap-2 pt-1">
        <Skeleton height={12} width={60} />
        <Skeleton height={12} width={40} />
      </div>
    </div>
  );
}
