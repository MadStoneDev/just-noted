"use client";

import React, { useState, useCallback } from "react";
import {
  IconShare,
  IconX,
  IconCopy,
  IconCheck,
  IconUsers,
  IconLock,
  IconWorld,
  IconTrash,
  IconCrown,
} from "@tabler/icons-react";
import { CombinedNote } from "@/types/combined-notes";
import { NoteCollaborator, CollaboratorRole } from "@/types/subscription";

interface ShareNoteModalProps {
  note: CombinedNote;
  isOpen: boolean;
  onClose: () => void;
  isPro: boolean;
  collaborators?: NoteCollaborator[];
  onAddCollaborator?: (email: string, role: CollaboratorRole) => Promise<void>;
  onRemoveCollaborator?: (odId: string) => Promise<void>;
  onUpdateRole?: (odId: string, role: CollaboratorRole) => Promise<void>;
}

export default function ShareNoteModal({
  note,
  isOpen,
  onClose,
  isPro,
  collaborators = [],
  onAddCollaborator,
  onRemoveCollaborator,
  onUpdateRole,
}: ShareNoteModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("viewer");
  const [isAdding, setIsAdding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate share link (in a real app, this would create a unique link)
  const shareLink = `https://justnoted.app/shared/${note.id}`;

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy link");
    }
  }, [shareLink]);

  const handleAddCollaborator = useCallback(async () => {
    if (!email.trim() || !onAddCollaborator) return;

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    setIsAdding(true);
    setError(null);

    try {
      await onAddCollaborator(email.trim(), role);
      setEmail("");
    } catch (err) {
      setError("Failed to add collaborator");
    } finally {
      setIsAdding(false);
    }
  }, [email, role, onAddCollaborator]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <IconShare size={20} className="text-mercedes-primary" />
            <h2 id="share-modal-title" className="text-lg font-semibold">
              Share Note
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Upgrade prompt for free users */}
          {!isPro && (
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <IconCrown size={24} className="text-purple-500 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-purple-900">Upgrade to Pro</h3>
                  <p className="text-sm text-purple-700 mt-1">
                    Collaborate with others in real-time. Share notes with your team and work together seamlessly.
                  </p>
                  <a
                    href="/pricing"
                    className="inline-block mt-3 px-4 py-2 bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-600 transition-colors"
                  >
                    View Plans
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Share link section */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Share Link
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareLink}
                readOnly
                className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-600"
              />
              <button
                onClick={handleCopyLink}
                className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1 ${
                  copied
                    ? "bg-green-500 text-white"
                    : "bg-neutral-100 hover:bg-neutral-200"
                }`}
              >
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              </button>
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Anyone with this link can view this note
            </p>
          </div>

          {/* Add collaborator section (Pro only) */}
          {isPro && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Add Collaborators
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-mercedes-primary"
                />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as CollaboratorRole)}
                  className="px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:border-mercedes-primary"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <button
                  onClick={handleAddCollaborator}
                  disabled={isAdding || !email.trim()}
                  className="px-4 py-2 bg-mercedes-primary text-white rounded-lg hover:bg-mercedes-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>

              {error && (
                <p className="text-sm text-red-600 mt-2">{error}</p>
              )}

              {/* Collaborators list */}
              {collaborators.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-sm font-medium text-neutral-600">
                    People with access
                  </h4>
                  {collaborators.map((collab) => (
                    <div
                      key={collab.odId}
                      className="flex items-center justify-between py-2 px-3 bg-neutral-50 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-mercedes-primary/10 rounded-full flex items-center justify-center">
                          <IconUsers size={16} className="text-mercedes-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {collab.displayName || collab.email}
                          </p>
                          <p className="text-xs text-neutral-500">{collab.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {collab.role === "owner" ? (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">
                            Owner
                          </span>
                        ) : (
                          <>
                            <select
                              value={collab.role}
                              onChange={(e) =>
                                onUpdateRole?.(collab.odId, e.target.value as CollaboratorRole)
                              }
                              className="text-xs border border-neutral-200 rounded px-2 py-1"
                            >
                              <option value="viewer">Viewer</option>
                              <option value="editor">Editor</option>
                            </select>
                            <button
                              onClick={() => onRemoveCollaborator?.(collab.odId)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                              title="Remove"
                            >
                              <IconTrash size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Privacy note */}
          <div className="flex items-start gap-2 text-sm text-neutral-500">
            <IconLock size={16} className="flex-shrink-0 mt-0.5" />
            <p>
              {note.isPrivate
                ? "This note is private. Only you and invited collaborators can access it."
                : "This note can be accessed by anyone with the link."}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// Simple presence indicator component
export function CollaboratorPresence({
  collaborators,
}: {
  collaborators: { email: string; displayName?: string; isEditing: boolean }[];
}) {
  if (collaborators.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {collaborators.slice(0, 3).map((collab, index) => (
        <div
          key={collab.email}
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white ${
            collab.isEditing ? "bg-green-500 ring-2 ring-green-200" : "bg-neutral-400"
          }`}
          style={{ marginLeft: index > 0 ? "-8px" : 0 }}
          title={`${collab.displayName || collab.email}${collab.isEditing ? " (editing)" : ""}`}
        >
          {(collab.displayName || collab.email).charAt(0).toUpperCase()}
        </div>
      ))}
      {collaborators.length > 3 && (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium bg-neutral-300 text-neutral-600"
          style={{ marginLeft: "-8px" }}
        >
          +{collaborators.length - 3}
        </div>
      )}
    </div>
  );
}
