"use client";

import React, { useState, useEffect } from "react";
import { Notebook, CoverType } from "@/types/notebook";
import NotebookCoverPicker from "./notebook-cover-picker";
import { DEFAULT_COVER_TYPE, DEFAULT_COVER_VALUE } from "@/lib/notebook-covers";
import { IconX, IconLoader2, IconTrash, IconEyeOff } from "@tabler/icons-react";

interface NotebookModalProps {
  isOpen: boolean;
  onClose: () => void;
  notebook?: Notebook | null;
  notebooks?: Notebook[];
  parentIsHidden?: boolean;
  onSave: (data: {
    name: string;
    coverType: CoverType;
    coverValue: string;
    pendingFile?: File | null;
    wordGoal?: number;
    isHidden?: boolean;
    parentId?: string | null;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function NotebookModal({
  isOpen,
  onClose,
  notebook,
  notebooks = [],
  parentIsHidden,
  onSave,
  onDelete,
}: NotebookModalProps) {
  const [name, setName] = useState("");
  const [coverType, setCoverType] = useState<CoverType>(DEFAULT_COVER_TYPE);
  const [coverValue, setCoverValue] = useState(DEFAULT_COVER_VALUE);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [wordGoal, setWordGoal] = useState(0);
  const [isHidden, setIsHidden] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
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
        setWordGoal(notebook.wordGoal || 0);
        setIsHidden(notebook.isHidden ?? false);
        setParentId(notebook.parentId || null);
      } else {
        setName("");
        setWordGoal(0);
        setIsHidden(false);
        setParentId(null);
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
        wordGoal,
        isHidden,
        parentId,
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
          className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] w-full max-w-md overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-primary)]">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {isEditing ? "Edit Notebook" : "Create Notebook"}
            </h2>
            <button
              onClick={onClose}
              disabled={isSaving || isDeleting}
              className="p-2 rounded-[var(--radius-lg)] hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50"
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
                  className="block text-sm font-medium text-[var(--color-text-primary)] mb-1"
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
                  className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  autoFocus
                  disabled={isSaving || isDeleting}
                />
              </div>

              {/* Parent notebook */}
              {(() => {
                const hasChildren = isEditing && notebooks.some((nb) => nb.parentId === notebook?.id);
                const eligibleParents = notebooks.filter((nb) => {
                  if (nb.id === notebook?.id) return false;
                  if (nb.parentId) return false;
                  return true;
                });
                if (eligibleParents.length === 0) return null;
                return (
                  <div>
                    <label htmlFor="parent-notebook" className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                      Parent Notebook <span className="text-[var(--color-text-tertiary)] font-normal">(optional)</span>
                    </label>
                    <select
                      id="parent-notebook"
                      value={parentId || ""}
                      onChange={(e) => setParentId(e.target.value || null)}
                      disabled={isSaving || isDeleting || hasChildren}
                      className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] text-sm bg-[var(--color-bg-primary)] disabled:opacity-50"
                    >
                      <option value="">None (top-level)</option>
                      {eligibleParents.map((nb) => (
                        <option key={nb.id} value={nb.id}>{nb.name}</option>
                      ))}
                    </select>
                    {hasChildren && (
                      <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                        Cannot nest a notebook that has sub-notebooks
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Word goal */}
              <div>
                <label htmlFor="word-goal" className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  Word Goal <span className="text-[var(--color-text-tertiary)] font-normal">(optional)</span>
                </label>
                <input
                  id="word-goal"
                  type="number"
                  min={0}
                  value={wordGoal || ""}
                  onChange={(e) => setWordGoal(parseInt(e.target.value) || 0)}
                  placeholder="e.g. 50000"
                  className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] text-sm"
                  disabled={isSaving || isDeleting}
                />
              </div>

              {/* Private toggle */}
              {(() => {
                const effectiveParentHidden = parentId
                  ? notebooks.find((nb) => nb.id === parentId)?.isHidden ?? false
                  : parentIsHidden ?? false;
                return (
              <div>
                <div
                    className={`flex items-center justify-between p-3 rounded-[var(--radius-lg)] border transition-colors ${
                      effectiveParentHidden
                        ? "border-[var(--color-border-secondary)] bg-[var(--color-bg-tertiary)] opacity-60"
                        : isHidden
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-subtle)]"
                          : "border-[var(--color-border-primary)]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <IconEyeOff size={18} className={isHidden || effectiveParentHidden ? "text-[var(--color-accent)]" : "text-[var(--color-text-tertiary)]"} />
                      <div>
                        <div className="text-sm font-medium text-[var(--color-text-primary)]">Private notebook</div>
                        <div className="text-xs text-[var(--color-text-tertiary)]">
                          {effectiveParentHidden
                            ? "Hidden by parent notebook"
                            : "Notes won’t appear in All Notes"}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isHidden || effectiveParentHidden}
                      disabled={isSaving || isDeleting || effectiveParentHidden}
                      onClick={() => setIsHidden(!isHidden)}
                      className={`relative w-9 h-5 rounded-full transition-colors disabled:cursor-not-allowed ${
                        isHidden || effectiveParentHidden ? "bg-[var(--color-accent)]" : "bg-[var(--color-border-primary)]"
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        isHidden || effectiveParentHidden ? "translate-x-4" : ""
                      }`} />
                    </button>
                  </div>
                </div>
                );
              })()}

              {/* Cover picker */}
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
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
                <div className="p-3 bg-[var(--color-danger-subtle)] text-[var(--color-danger)] text-sm rounded-[var(--radius-lg)]">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--color-border-primary)] flex items-center justify-between">
              {/* Delete button (only when editing) */}
              <div>
                {isEditing && onDelete && (
                  <>
                    {showDeleteConfirm ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[var(--color-text-secondary)]">Delete?</span>
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={isDeleting}
                          className="px-3 py-1 text-sm bg-[var(--color-danger-subtle)]0 text-white rounded-[var(--radius-lg)] hover:bg-[var(--color-danger)] disabled:opacity-50"
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
                          className="px-3 py-1 text-sm bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] rounded-[var(--radius-lg)] hover:bg-[var(--color-active)]"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isSaving || isDeleting}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)] rounded-[var(--radius-lg)] transition-colors disabled:opacity-50"
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
                  className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded-[var(--radius-lg)] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isDeleting}
                  className="px-4 py-2 text-sm bg-[var(--color-accent)] text-white rounded-[var(--radius-lg)] hover:bg-[var(--color-accent)]/90 disabled:opacity-50 flex items-center gap-2"
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
