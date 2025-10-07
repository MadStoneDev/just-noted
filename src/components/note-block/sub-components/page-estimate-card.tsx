import React from "react";
import { IconBook, IconPencil } from "@tabler/icons-react";

interface PageEstimateCardProps {
  pageEstimate: string;
  currentFormat: string;
  onClick: () => void;
  isPrivate: boolean;
}

/**
 * Page estimate card with format selector
 * Shows page count and current format with an edit button
 */
export default function PageEstimateCard({
  pageEstimate,
  currentFormat,
  onClick,
  isPrivate,
}: PageEstimateCardProps) {
  return (
    <div
      className={`col-span-4 xs:col-span-1 flex xs:flex-col sm:flex-row items-center justify-center rounded-xl bg-neutral-200 border border-neutral-400 text-base overflow-hidden transition-all duration-300 ease-in-out`}
    >
      <div className={`py-1 flex-grow flex flex-col items-center`}>
        <span
          className={`flex items-center gap-1 ${
            isPrivate ? "text-violet-800" : "text-mercedes-primary"
          } text-lg font-medium`}
        >
          <IconBook
            size={20}
            className={`block xs:hidden sm:block md:hidden lg:block`}
          />
          {pageEstimate}
        </span>
        <span className={`flex items-center gap-1 font-bold capitalize`}>
          {currentFormat}
        </span>
      </div>
      <button
        type="button"
        onClick={onClick}
        title="Click to change page format"
        className={`cursor-pointer block xs:hidden sm:block px-2 grid place-content-center h-full border-l border-neutral-400 hover:bg-mercedes-primary hover:text-white transition-all duration-300 ease-in-out`}
      >
        <IconPencil size={20} strokeWidth={2} />
      </button>
    </div>
  );
}
