import React from "react";
import { IconBook, IconSettings } from "@tabler/icons-react";

interface PageEstimateCardProps {
  pageEstimate: string;
  currentFormat: string;
  onClick: () => void;
  isPrivate: boolean;
  hasNotebookCover?: boolean;
}

/**
 * Page estimate card with format selector
 * Shows page count and current format with clear edit button
 */
export default function PageEstimateCard({
  pageEstimate,
  currentFormat,
  onClick,
  isPrivate,
  hasNotebookCover,
}: PageEstimateCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Change page format"
      className={`group col-span-4 xs:col-span-2 sm:col-span-4 flex items-center gap-3 p-3 rounded-[var(--radius-xl)] transition-all duration-200 ${
        hasNotebookCover
          ? "bg-[var(--color-bg-secondary)]/70 hover:bg-[var(--color-bg-secondary)]/90"
          : isPrivate
            ? "border-2 border-dashed border-violet-300 hover:border-violet-500 hover:bg-violet-50"
            : "border-2 border-dashed border-[var(--color-border-primary)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/5"
      }`}
    >
      <div className={`p-2 rounded-[var(--radius-lg)] ${
        hasNotebookCover
          ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverse)]"
          : isPrivate
            ? "bg-violet-100 text-violet-600"
            : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
      } group-hover:scale-105 transition-transform`}>
        <IconBook size={20} />
      </div>
      <div className="flex-1 text-left">
        <div className={`flex flex-nowrap items-center text-lg font-semibold ${
          hasNotebookCover
            ? "text-[var(--color-text-primary)]"
            : isPrivate
              ? "text-violet-700"
              : "text-[var(--color-text-primary)]"
        }`}>
          {pageEstimate}
        </div>
        <div className={`text-xs capitalize ${hasNotebookCover ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-secondary)]"}`}>{currentFormat}</div>
      </div>
      <div className={`p-1.5 rounded-full md:opacity-0 group-hover:opacity-100 transition-opacity ${
        hasNotebookCover
          ? "bg-[var(--color-text-primary)] text-[var(--color-text-tertiary)]"
          : isPrivate
            ? "bg-violet-200 text-violet-700"
            : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
      }`}>
        <IconSettings size={20} />
      </div>
    </button>
  );
}
