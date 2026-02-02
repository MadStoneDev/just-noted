"use client";

import React, { useState, useEffect } from "react";
import { Notebook, CoverType } from "@/types/notebook";
import NotebookCoverPicker from "./notebook-cover-picker";
import { DEFAULT_COVER_TYPE, DEFAULT_COVER_VALUE } from "@/lib/notebook-covers";
import { IconX, IconLoader2, IconTrash } from "@tabler/icons-react";

interface NotebookModalProps {
  isOpen: boolean;
  onClose: () => void;
  notebook?: Notebook | null; // If provided, we're editing; otherwise creating
  onSave: (data: {
    name: string;
    coverType: CoverType;
    coverValue: string;
    pendingFile?: File | null; // File to upload after save
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function NotebookModal({
  isOpen,
  onClose,
  notebook,
  onSave,
  onDelete,
}: NotebookModalProps) {
  const [name, setName] = useState("");
  const [coverType, setCoverType] = useState<CoverType>(DEFAULT_COVER_TYPE);
  const [coverValue, setCoverValue] = useState(DEFAULT_COVER_VALUE);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isEditing = !!notebook;

  // Reset form when modal opens or notebook changes
  useEffect(() => {
    if (isOpen) {
      if (notebook) {
        setName(notebook.name);
        setCoverType(notebook.coverType);
        setCoverValue(notebook.coverValue);
      } else {
        setName("");
        setCoverType(DEFAULT_COVER_TYPE);
        setCoverValue(DEFAULT_COVER_VALUE);
      }
      setPendingFile(null);
      setError(null);
      setShowDeleteConfirm(false);
    }
  }, [isOpen, notebook]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSaving && !isDeleting) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, isDeleting, onClose]);

  const handleCoverSelect = (type: CoverType, value: string) => {
    setCoverType(type);
    setCoverValue(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter a notebook name");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        name: trimmedName,
        coverType,
        coverValue,
        pendingFile: pendingFile,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save notebook");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    setError(null);

    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete notebook");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isSaving && !isDeleting) {
            onClose();
          }
        }}
      >
        {/* Modal */}
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
            <h2 className="text-lg font-semibold text-neutral-800">
              {isEditing ? "Edit Notebook" : "Create Notebook"}
            </h2>
            <button
              onClick={onClose}
              disabled={isSaving || isDeleting}
              className="p-2 rounded-lg hover:bg-neutral-100 transition-colors disabled:opacity-50"
              aria-label="Close"
            >
              <IconX size={20} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Name input */}
              <div>
                <label
                  htmlFor="notebook-name"
                  className="block text-sm font-medium text-neutral-700 mb-1"
                >
                  Name
                </label>
                <input
                  id="notebook-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    // Prevent Enter from submitting the form - require explicit button click
                    if (e.key === "Enter") {
                      e.preventDefault();
                    }
                  }}
                  placeholder="My Notebook"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:border-mercedes-primary focus:outline-none focus:ring-1 focus:ring-mercedes-primary"
                  autoFocus
                  disabled={isSaving || isDeleting}
                />
              </div>

              {/* Cover picker */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Cover
                </label>
                <NotebookCoverPicker
                  coverType={coverType}
                  coverValue={coverValue}
                  onSelect={handleCoverSelect}
                  onFileSelect={setPendingFile}
                  pendingFile={pendingFile}
                />
              </div>

              {/* Error message */}
              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-between">
              {/* Delete button (only when editing) */}
              <div>
                {isEditing && onDelete && (
                  <>
                    {showDeleteConfirm ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-neutral-600">Delete?</span>
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={isDeleting}
                          className="px-3 py-1 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                        >
                          {isDeleting ? (
                            <IconLoader2 size={14} className="animate-spin" />
                          ) : (
                            "Yes"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(false)}
                          disabled={isDeleting}
                          className="px-3 py-1 text-sm bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isSaving || isDeleting}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <IconTrash size={16} />
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving || isDeleting}
                  className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isDeleting}
                  className="px-4 py-2 text-sm bg-mercedes-primary text-white rounded-lg hover:bg-mercedes-primary/90 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <IconLoader2 size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : isEditing ? (
                    "Save Changes"
                  ) : (
                    "Create Notebook"
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
