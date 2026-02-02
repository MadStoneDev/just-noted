import React from "react";
import { IconBook, IconSettings } from "@tabler/icons-react";

interface PageEstimateCardProps {
  pageEstimate: string;
  currentFormat: string;
  onClick: () => void;
  isPrivate: boolean;
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
}: PageEstimateCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Change page format"
      className={`group col-span-4 xs:col-span-2 sm:col-span-4 flex items-center gap-3 p-3 rounded-xl border-2 border-dashed transition-all duration-200 ${
        isPrivate
          ? "border-violet-300 hover:border-violet-500 hover:bg-violet-50"
          : "border-neutral-300 hover:border-mercedes-primary hover:bg-mercedes-primary/5"
      }`}
    >
      <div className={`p-2 rounded-lg ${
        isPrivate ? "bg-violet-100 text-violet-600" : "bg-neutral-100 text-neutral-500"
      } group-hover:scale-105 transition-transform`}>
        <IconBook size={20} />
      </div>
      <div className="flex-1 text-left">
        <div className={`text-lg font-semibold ${
          isPrivate ? "text-violet-700" : "text-neutral-800"
        }`}>
          {pageEstimate}
        </div>
        <div className="text-xs text-neutral-500 capitalize">{currentFormat}</div>
      </div>
      <div className={`p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${
        isPrivate ? "bg-violet-200 text-violet-700" : "bg-neutral-200 text-neutral-600"
      }`}>
        <IconSettings size={14} />
      </div>
    </button>
  );
}
