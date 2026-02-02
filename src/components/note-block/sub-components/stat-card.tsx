import React from "react";

interface StatCardProps {
  label: string;
  value: number | string;
  isPrivate: boolean;
}

/**
 * Reusable statistics card component
 * Displays a statistic with label in a clean, minimal format
 * Responsive: w-full in col layouts (xs, md), flex-1 in row layouts (sm, lg)
 */
export default function StatCard({ label, value, isPrivate }: StatCardProps) {
  return (
    <div className="w-full sm:w-auto md:w-full lg:w-auto flex-1 flex flex-col items-center justify-center py-2 px-3">
      <span
        className={`text-xl font-semibold tabular-nums ${
          isPrivate ? "text-violet-700" : "text-neutral-800"
        }`}
      >
        {value}
      </span>
      <span className="text-xs text-neutral-500 uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}
