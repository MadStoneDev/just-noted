import React from "react";
import { IconDeviceFloppy } from "@tabler/icons-react";

interface SaveButtonProps {
  onClick: () => void;
  isPending: boolean;
  isPrivate: boolean;
}

/**
 * Manual save button with hover expansion
 * Forces an immediate save of the note
 */
export default function SaveButton({
  onClick,
  isPending,
  isPrivate,
}: SaveButtonProps) {
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={onClick}
      title="Save note manually"
      aria-label="Save note manually"
      className={`group/save flex-grow sm:flex-grow-0 px-2 cursor-pointer flex flex-row-reverse items-center justify-center gap-0 md:hover:gap-2 w-fit min-w-[44px] h-[44px] rounded-lg border sm:border-0 ${
        isPrivate
          ? "hover:bg-violet-800 hover:text-neutral-100"
          : "border-neutral-500 hover:border-mercedes-primary hover:bg-mercedes-primary"
      } ${
        isPending ? "opacity-50 cursor-not-allowed" : ""
      } text-neutral-800 overflow-hidden transition-all duration-300 ease-in-out`}
    >
      <IconDeviceFloppy size={20} strokeWidth={2} />
      <span
        className={`w-fit max-w-0 md:group-hover/save:max-w-52 opacity-0 md:group-hover/save:opacity-100 overflow-hidden transition-all duration-300 ease-in-out`}
      >
        Force Save Note
      </span>
    </button>
  );
}
