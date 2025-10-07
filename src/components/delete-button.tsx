// src/components/delete-button.tsx
"use client";

import React, { useState, useCallback } from "react";
import { IconTrash } from "@tabler/icons-react";
import { ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { deleteNote as deleteSupabaseNote } from "@/app/actions/supabaseActions";
import { noteOperation } from "@/app/actions/notes";
import { NoteSource } from "@/types/combined-notes";

interface DeleteButtonProps {
  noteId: string;
  noteTitle: string;
  userId: string;
  noteSource: NoteSource;
  onDeleteSuccess?: (noteId: string) => void;
}

export default function DeleteButton({
  noteId,
  noteTitle,
  userId,
  noteSource,
  onDeleteSuccess,
}: DeleteButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { showSuccess, showError } = useToast();

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirm(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    setIsDeleting(true);

    try {
      const deletePromise =
        noteSource === "redis"
          ? noteOperation("redis", {
              operation: "delete",
              userId,
              noteId,
            })
          : deleteSupabaseNote(noteId);

      const result = await deletePromise;

      if (result.success) {
        showSuccess(`"${noteTitle}" deleted successfully`);
        if (onDeleteSuccess) {
          onDeleteSuccess(noteId);
        }
        setShowConfirm(false);
      } else {
        showError("Failed to delete note");
        setIsDeleting(false);
      }
    } catch (error) {
      console.error("Delete error:", error);
      showError("An unexpected error occurred");
      setIsDeleting(false);
    }
  }, [
    noteSource,
    userId,
    noteId,
    noteTitle,
    onDeleteSuccess,
    showSuccess,
    showError,
  ]);

  const handleCancel = useCallback(() => {
    setShowConfirm(false);
  }, []);

  if (isDeleting) {
    return (
      <span className="animate-pulse text-sm text-red-500">Deleting...</span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title="Delete this note"
        className="p-2 cursor-pointer flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 rounded-lg border border-red-700 sm:border-0 hover:bg-red-700 text-red-700 hover:text-neutral-100 transition-all duration-300 ease-in-out"
      >
        <IconTrash size={20} strokeWidth={2} />
      </button>

      <ConfirmModal
        isOpen={showConfirm}
        onClose={handleCancel}
        onConfirm={handleConfirm}
        title="Delete Note"
        message={`Are you sure you want to delete "${noteTitle}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        isLoading={isDeleting}
      />
    </>
  );
}
