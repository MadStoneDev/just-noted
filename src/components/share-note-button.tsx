// components/share-note-button.tsx
"use client";

import React, { useState } from "react";
import {
  IconShare,
  IconLoader,
  IconCopy,
  IconCheck,
  IconLock,
  IconWorld,
} from "@tabler/icons-react";
import { Note } from "@/types/notes";
import { shareNoteAction } from "@/app/actions/shareActions";

interface ShareNoteButtonProps {
  note: Note;
  userId: string;
  authUserId: string | null;
  isAuthenticated: boolean;
  storageType: "redis" | "supabase";
  noteIsPrivate: boolean;
}

export function ShareNoteButton({
  note,
  userId,
  authUserId,
  isAuthenticated,
  storageType,
  noteIsPrivate,
}: ShareNoteButtonProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [recipientUsername, setRecipientUsername] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleShare = async () => {
    setIsSharing(true);
    setError(null);

    try {
      const result = await shareNoteAction({
        noteId: note.id,
        noteOwnerId: isAuthenticated ? (authUserId as string) : userId,
        storage: storageType,
        isPublic: isPublic,
        recipientUsername: isPublic ? null : recipientUsername.trim(),
      });

      if (result.success) {
        setShareUrl(`${window.location.origin}/${result.shortcode}`);
      } else {
        setError(result.error || "Failed to share note");
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error("Error sharing note:", err);
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyLink = () => {
    if (shareUrl) {
      navigator.clipboard
        .writeText(shareUrl)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch((err) => {
          console.error("Failed to copy: ", err);
        });
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setShareUrl(null);
    setError(null);
    setCopied(false);
    setIsPublic(true);
    setRecipientUsername("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        disabled={isSharing}
        title="Share this note"
        className={`p-2 cursor-pointer flex items-center justify-center gap-1 rounded-lg border-2 ${
          noteIsPrivate
            ? "border-violet-800 hover:bg-violet-800"
            : "border-mercedes-primary hover:bg-mercedes-primary"
        } text-neutral-800 hover:text-white transition-all duration-300 ease-in-out ${
          isSharing ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        <IconShare size={20} strokeWidth={2} />
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Share Note</h3>

            {!shareUrl ? (
              <>
                <div className="mb-4">
                  <div className="flex items-center space-x-4 mb-4">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        className="mr-2"
                        checked={isPublic}
                        onChange={() => setIsPublic(true)}
                      />
                      <IconWorld size={20} className="mr-1" />
                      <span>Public</span>
                    </label>

                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        className="mr-2"
                        checked={!isPublic}
                        onChange={() => setIsPublic(false)}
                      />
                      <IconLock size={20} className="mr-1" />
                      <span>Private</span>
                    </label>
                  </div>

                  {!isPublic && (
                    <div className="mb-4">
                      <label className="block mb-2 text-sm font-medium">
                        Share with username:
                      </label>
                      <input
                        type="text"
                        value={recipientUsername}
                        onChange={(e) => setRecipientUsername(e.target.value)}
                        placeholder="Enter username"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  )}

                  {error && (
                    <div className="mb-4 text-red-500 text-sm">{error}</div>
                  )}

                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={closeModal}
                      className="px-4 py-2 border border-gray-300 rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleShare}
                      disabled={
                        isSharing || (!isPublic && !recipientUsername.trim())
                      }
                      className={`px-4 py-2 bg-mercedes-primary text-white rounded-md flex items-center ${
                        isSharing || (!isPublic && !recipientUsername.trim())
                          ? "opacity-50 cursor-not-allowed"
                          : ""
                      }`}
                    >
                      {isSharing ? (
                        <>
                          <IconLoader className="animate-spin mr-2" size={16} />
                          Sharing...
                        </>
                      ) : (
                        "Share"
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <p className="mb-2 text-sm font-medium">Share this link:</p>
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={shareUrl}
                      readOnly
                      className="flex-grow px-3 py-2 border border-gray-300 rounded-l-md bg-gray-50"
                    />
                    <button
                      onClick={handleCopyLink}
                      className="px-3 py-2 bg-gray-200 border border-gray-300 rounded-r-md"
                    >
                      {copied ? (
                        <IconCheck size={20} className="text-green-600" />
                      ) : (
                        <IconCopy size={20} />
                      )}
                    </button>
                  </div>
                </div>

                <p className="text-sm mb-4">
                  {isPublic
                    ? "Anyone with this link can view the note."
                    : `Only the user "${recipientUsername}" can view this note.`}
                </p>

                <div className="flex justify-end">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 bg-mercedes-primary text-white rounded-md"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
