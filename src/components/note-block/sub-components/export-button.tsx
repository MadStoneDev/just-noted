import React from "react";
import { IconFileTypeTxt } from "@tabler/icons-react";

interface ExportButtonProps {
  onClick: () => void;
  isPrivate: boolean;
}

/**
 * Export button with hover expansion
 * Exports note as a .txt file
 */
export default function ExportButton({
  onClick,
  isPrivate,
}: ExportButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Export as text file"
      className={`group/export px-2 cursor-pointer flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 w-fit min-w-10 h-10 rounded-lg border-1 ${
        isPrivate
          ? "border-violet-800 hover:bg-violet-800 hover:text-neutral-100"
          : "border-neutral-500 hover:border-mercedes-primary hover:bg-mercedes-primary"
      } text-neutral-800 overflow-hidden transition-all duration-300 ease-in-out`}
    >
      <IconFileTypeTxt size={20} strokeWidth={2} />
      <span
        className={`w-fit max-w-0 sm:group-hover/export:max-w-52 opacity-0 md:group-hover/export:opacity-100 overflow-hidden transition-all duration-300 ease-in-out`}
      >
        Export as .txt File
      </span>
    </button>
  );
}
