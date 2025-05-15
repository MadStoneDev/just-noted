"use client";

import React, { useState } from "react";
import { IconCloudUpload, IconLoader } from "@tabler/icons-react";
import { Note } from "@/types/notes";
import { transferNoteToSupabaseAction } from "@/utils/supabase/supabase-utils";

export function TransferNoteButton({
  note,
  redisUserId,
  authUserId,
  onTransfer,
  noteIsPrivate,
  canTransfer = false,
  isTransferring = false,
}: {
  note: Note;
  redisUserId: string;
  authUserId: string | null;
  onTransfer?: (noteId: string) => void;
  noteIsPrivate: boolean;
  canTransfer?: boolean;
  isTransferring?: boolean;
}) {
  const [transferStatus, setTransferStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [isTransferringLocal, setIsTransferringLocal] =
    useState(isTransferring);

  // Don't render anything if transfer is not possible
  if (!canTransfer) {
    return null;
  }

  const handleTransfer = async () => {
    if (!authUserId || !onTransfer) return;

    setIsTransferringLocal(true);
    setTransferStatus("pending");

    try {
      const result = await transferNoteToSupabaseAction(
        redisUserId,
        authUserId,
        note.id,
      );

      if (result.success) {
        setTransferStatus("success");
        onTransfer(note.id);
      } else {
        setTransferStatus("error");
        console.error("Failed to transfer note:", result.error);
        // Show error message to user
      }
    } catch (error) {
      setTransferStatus("error");
      console.error("Error transferring note:", error);
    } finally {
      setIsTransferringLocal(false);
      // Reset status after delay
      if (transferStatus === "success") {
        setTimeout(() => setTransferStatus("idle"), 2000);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleTransfer}
      disabled={isTransferringLocal || isTransferring}
      title="Save note to your account"
      className={`p-2 cursor-pointer flex items-center justify-center gap-1 rounded-lg border-2 ${
        noteIsPrivate
          ? "border-violet-800 hover:bg-violet-800"
          : "border-mercedes-primary hover:bg-mercedes-primary"
      } text-neutral-800 hover:text-white transition-all duration-300 ease-in-out ${
        isTransferringLocal || isTransferring
          ? "opacity-50 cursor-not-allowed"
          : ""
      }`}
    >
      {isTransferringLocal || isTransferring ? (
        <IconLoader size={20} strokeWidth={2} className="animate-spin" />
      ) : (
        <IconCloudUpload size={20} strokeWidth={2} />
      )}
    </button>
  );
}
