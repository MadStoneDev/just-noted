import React from "react";
import { IconCloudUpload, IconDeviceDesktopDown } from "@tabler/icons-react";
import type { NoteSource } from "@/types/combined-notes";

interface TransferButtonProps {
  noteSource: NoteSource;
  onTransfer: (targetSource: NoteSource) => void;
  isPrivate: boolean;
}

/**
 * Transfer button with hover expansion
 * Switches between "Transfer to Cloud" and "Move to Local" based on note source
 */
export default function TransferButton({
  noteSource,
  onTransfer,
  isPrivate,
}: TransferButtonProps) {
  const targetSource = noteSource === "redis" ? "supabase" : "redis";
  const isToCloud = noteSource === "redis";

  return (
    <button
      type="button"
      onClick={() => onTransfer(targetSource)}
      title={isToCloud ? "Transfer to Cloud" : "Transfer to Local"}
      aria-label={isToCloud ? "Transfer to Cloud" : "Transfer to Local"}
      className={`group/transfer px-2 cursor-pointer flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 w-fit min-w-[44px] h-[44px] rounded-lg border-1 ${
        isPrivate
          ? "border-violet-800 hover:bg-violet-800 hover:text-neutral-100"
          : "border-neutral-500 hover:border-mercedes-primary hover:bg-mercedes-primary"
      } text-neutral-800 overflow-hidden transition-all duration-300 ease-in-out`}
    >
      {isToCloud ? (
        <div
          className={`flex items-center gap-0 md:group-hover/transfer:gap-2 transition-all duration-400 ease-in-out`}
        >
          <IconCloudUpload size={20} strokeWidth={2} />
          <span
            className={`w-fit max-w-0 md:group-hover/transfer:max-w-52 opacity-0 md:group-hover/transfer:opacity-100 overflow-hidden transition-all duration-300 ease-in-out`}
          >
            Transfer to Cloud
          </span>
        </div>
      ) : (
        <div
          className={`flex items-center gap-0 md:group-hover/transfer:gap-2 transition-all duration-400 ease-in-out`}
        >
          <IconDeviceDesktopDown size={20} strokeWidth={2} />
          <span
            className={`w-fit max-w-0 md:group-hover/transfer:max-w-52 opacity-0 md:group-hover/transfer:opacity-100 overflow-hidden transition-all duration-300 ease-in-out`}
          >
            Move to Local
          </span>
        </div>
      )}
    </button>
  );
}
