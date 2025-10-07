import React from "react";

interface StatCardProps {
  label: string;
  value: number | string;
  isPrivate: boolean;
}

/**
 * Reusable statistics card component
 * Displays a statistic with label in a consistent format
 */
export default function StatCard({ label, value, isPrivate }: StatCardProps) {
  return (
    <p
      className={`py-1 col-span-4 xs:col-span-1 flex xs:flex-col xl:flex-row items-center justify-center xl:gap-1 bg-neutral-200 rounded-xl border border-neutral-400 text-base`}
    >
      <span
        className={`${
          isPrivate ? "text-violet-800" : "text-mercedes-primary"
        } text-lg font-medium`}
      >
        {value}
      </span>
      <span>{label}</span>
    </p>
  );
}
