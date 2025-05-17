import React, { useState } from "react";
import { IconTrash } from "@tabler/icons-react";
import { deleteNoteAction } from "@/app/actions/redisActions";
import { deleteNote as deleteSupabaseNote } from "@/app/actions/supabaseActions";
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
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showConfirm, setShowConfirm] = useState<boolean>(false);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirm(true);
  };

  const cancelDelete = (): void => {
    setShowConfirm(false);
  };

  const confirmDelete = (): void => {
    setIsDeleting(true);
    setShowConfirm(false);

    const deletePromise =
      noteSource === "redis"
        ? deleteNoteAction(userId, noteId)
        : deleteSupabaseNote(userId, noteId);

    deletePromise
      .then((result) => {
        if (result.success) {
          if (onDeleteSuccess) {
            onDeleteSuccess(noteId);
          }
        } else {
          console.error("Delete failed:", result.error);
          setIsDeleting(false);
        }
      })
      .catch((error) => {
        console.error("Delete error:", error);
        setIsDeleting(false);
      });
  };

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
        className="p-2 cursor-pointer flex items-center justify-center gap-1 rounded-lg hover:bg-red-700 text-neutral-800 hover:text-neutral-100 transition-all duration-300 ease-in-out"
      >
        <IconTrash size={20} strokeWidth={2} />
      </button>

      {showConfirm && (
        <div
          className={`fixed top-0 left-0 right-0 bottom-0 flex items-center justify-center z-50`}
        >
          <div
            className={`absolute top-0 left-0 bottom-0 right-0 bg-neutral-900 opacity-50`}
          ></div>

          <div className={`bg-white p-6 rounded-xl shadow-lg max-w-md z-50`}>
            <h3 className="text-lg font-semibold mb-4">Delete Note</h3>
            <p className="mb-6">
              Are you sure you want to delete{" "}
              <span className={`font-bold`}>{noteTitle}</span>? This action
              cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
