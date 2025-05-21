"use client";

import React, { useState, useEffect } from "react";
import {
  IconShare2,
  IconUsers,
  IconWorld,
  IconUserCheck,
  IconUserX,
  IconX,
  IconCopy,
  IconCheck,
  IconAlertCircle,
  IconLink,
  IconDeviceDesktopDown,
} from "@tabler/icons-react";
import {
  shareNoteAction,
  getSharedUsersAction,
  removeSharedUserAction,
} from "@/app/actions/shareNoteActions";

interface ShareNoteButtonProps {
  noteId: string;
  noteTitle: string;
  noteSource: "redis" | "supabase";
  isPrivate: boolean;
  isAuthenticated: boolean;
  userId: string;
}

export default function ShareNoteButton({
  noteId,
  noteTitle,
  noteSource,
  isAuthenticated,
  isPrivate = false,
  userId,
}: ShareNoteButtonProps) {
  // States
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [shareUsername, setShareUsername] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const [shortcode, setShortcode] = useState<string | null>(null);
  const [sharedUsers, setSharedUsers] = useState<string[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const [isRemovingUser, setIsRemovingUser] = useState(false);
  const [confirmRemoveUser, setConfirmRemoveUser] = useState<string | null>(
    null,
  );
  const [isLoadingSharedInfo, setIsLoadingSharedInfo] = useState(false);

  // Handle opening share modal
  const handleOpenShareModal = async () => {
    // Reset states
    setShareUsername("");
    setShareError(null);
    setShareSuccess(null);
    setIsSharing(false);
    setIsLoadingSharedInfo(true);
    setIsShareModalOpen(true);
    setShortcode(null);
    setSharedUsers([]);

    // Fetch existing shared users for this note
    if (isAuthenticated) {
      try {
        const result = await getSharedUsersAction(noteId, userId);

        if (result.success) {
          setIsPublic(result.isPublic || false);
          if (result.shortcode) {
            setShortcode(result.shortcode);
          }
          if (result.users && result.users.length > 0) {
            setSharedUsers(result.users);
          }
        } else {
          console.error("Error fetching shared info:", result.error);
          // Don't show error to user - just start fresh
        }
      } catch (error) {
        console.error("Error fetching existing shares:", error);
        // Don't show error to user - just start fresh
      } finally {
        setIsLoadingSharedInfo(false);
      }
    } else {
      setIsLoadingSharedInfo(false);
    }
  };

  // Handle share note
  const handleShareNote = async () => {
    if (!isAuthenticated) {
      setShareError("You must be signed in to share notes");
      return;
    }

    setIsSharing(true);
    setShareError(null);
    setShareSuccess(null);

    try {
      const result = await shareNoteAction({
        noteId,
        isPublic,
        username: isPublic ? null : shareUsername,
        currentUserId: userId,
        storage: noteSource,
      });

      if (result.success) {
        setShareSuccess(
          isPublic
            ? "Note shared publicly!"
            : `Note shared with ${shareUsername}!`,
        );
        setShortcode(result.shortcode);

        // Update shared users list if sharing privately
        if (
          !isPublic &&
          shareUsername &&
          !sharedUsers.includes(shareUsername)
        ) {
          setSharedUsers([...sharedUsers, shareUsername]);
        }

        // Clear input if successful
        setShareUsername("");
      } else {
        setShareError(result.error || "Failed to share note");
      }
    } catch (error) {
      console.error("Error sharing note:", error);
      setShareError("An unexpected error occurred");
    } finally {
      setIsSharing(false);
    }
  };

  // Handle remove user
  const handleRemoveUser = async (username: string) => {
    if (!isAuthenticated || !userId) {
      setShareError("You must be signed in to manage shared notes");
      return;
    }

    setIsRemovingUser(true);
    setShareError(null);

    try {
      const result = await removeSharedUserAction({
        noteId,
        username,
        currentUserId: userId,
      });

      if (result.success) {
        setSharedUsers(sharedUsers.filter((u) => u !== username));
        setShareSuccess(`Access removed for ${username}`);
      } else {
        setShareError(result.error || "Failed to remove user");
      }
    } catch (error) {
      console.error("Error removing user:", error);
      setShareError("An unexpected error occurred");
    } finally {
      setIsRemovingUser(false);
      setConfirmRemoveUser(null);
    }
  };

  // Copy shortcode link to clipboard
  const copyLink = () => {
    if (!shortcode) return;

    const shareUrl = `${window.location.origin}/${shortcode}`;
    navigator.clipboard.writeText(shareUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // If not authenticated, disable sharing
  const canShare = isAuthenticated;

  return (
    <>
      <button
        type="button"
        onClick={handleOpenShareModal}
        disabled={!canShare}
        className={`group/share px-2 cursor-pointer flex-grow sm:flex-grow-0 flex items-center justify-center gap-0 md:hover:gap-2 w-fit min-w-10 h-10 rounded-lg border-1 ${
          isPrivate
            ? "border-violet-800 hover:bg-violet-800 hover:text-neutral-100"
            : canShare
              ? "border-neutral-500 hover:border-mercedes-primary hover:bg-mercedes-primary"
              : "opacity-50 cursor-not-allowed border-neutral-300"
        } text-neutral-800 overflow-hidden transition-all duration-300 ease-in-out`}
        title={!canShare ? "Sign in to share notes" : "Share this note"}
      >
        <IconShare2 size={20} strokeWidth={2} />
        <span
          className={`w-fit max-w-0 md:group-hover/share:max-w-52 opacity-0 md:group-hover/share:opacity-100 overflow-hidden transition-all duration-300 ease-in-out`}
        >
          Share Note
        </span>
      </button>

      {/* Share Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Share Note</h3>
              <button
                onClick={() => setIsShareModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <IconX size={20} />
              </button>
            </div>

            {isLoadingSharedInfo ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin h-8 w-8 border-4 border-mercedes-primary border-t-transparent rounded-full"></div>
              </div>
            ) : (
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  Sharing <strong>{noteTitle}</strong>
                </p>

                {/* Share Type Selection */}
                <div className="flex justify-center space-x-4 mb-4">
                  <button
                    onClick={() => setIsPublic(true)}
                    className={`flex flex-col items-center p-3 rounded-lg border ${
                      isPublic
                        ? "border-mercedes-primary bg-mercedes-primary/10"
                        : "border-gray-200"
                    }`}
                  >
                    <IconWorld
                      size={24}
                      className={
                        isPublic ? "text-mercedes-primary" : "text-gray-500"
                      }
                    />
                    <span
                      className={`text-sm mt-1 ${
                        isPublic ? "text-mercedes-primary" : "text-gray-500"
                      }`}
                    >
                      Public
                    </span>
                  </button>

                  <button
                    onClick={() => setIsPublic(false)}
                    className={`flex flex-col items-center p-3 rounded-lg border ${
                      !isPublic
                        ? "border-mercedes-primary bg-mercedes-primary/10"
                        : "border-gray-200"
                    }`}
                  >
                    <IconUsers
                      size={24}
                      className={
                        !isPublic ? "text-mercedes-primary" : "text-gray-500"
                      }
                    />
                    <span
                      className={`text-sm mt-1 ${
                        !isPublic ? "text-mercedes-primary" : "text-gray-500"
                      }`}
                    >
                      Specific Users
                    </span>
                  </button>
                </div>

                {/* Share Link (if we have a shortcode) */}
                {shortcode && (
                  <div className="mb-4 p-3 bg-gray-100 rounded-lg">
                    <p className="text-sm font-medium mb-2">Share Link:</p>
                    <div className="flex items-center">
                      <input
                        readOnly
                        value={`${process.env.NEXT_PUBLIC_APP_URL}/${shortcode}`}
                        className="flex-grow p-2 border rounded-l-md text-sm bg-white"
                      />
                      <button
                        onClick={copyLink}
                        className="p-2 bg-mercedes-primary text-white rounded-r-md"
                      >
                        {isCopied ? (
                          <IconCheck size={18} />
                        ) : (
                          <IconCopy size={18} />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* User Input (for specific users) */}
                {!isPublic && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">
                      Share with username:
                    </label>
                    <div className="flex">
                      <input
                        type="text"
                        value={shareUsername}
                        onChange={(e) => setShareUsername(e.target.value)}
                        placeholder="Enter username"
                        className="flex-grow p-2 border rounded-l-md"
                      />
                      <button
                        onClick={handleShareNote}
                        disabled={isSharing || !shareUsername.trim()}
                        className={`p-2 bg-mercedes-primary text-white rounded-r-md ${
                          isSharing || !shareUsername.trim() ? "opacity-50" : ""
                        }`}
                      >
                        {isSharing ? "Sharing..." : "Share"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Error or Success Messages */}
                {shareError && (
                  <div className="mb-4 p-2 text-sm text-red-700 bg-red-100 rounded flex items-start gap-2">
                    <IconAlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span>{shareError}</span>
                  </div>
                )}

                {shareSuccess && (
                  <div className="mb-4 p-2 text-sm text-green-700 bg-green-100 rounded flex items-start gap-2">
                    <IconCheck size={16} className="shrink-0 mt-0.5" />
                    <span>{shareSuccess}</span>
                  </div>
                )}

                {/* Users this note is shared with */}
                {sharedUsers.length > 0 && (
                  <div className="mb-4 border-t pt-4">
                    <p className="text-sm font-medium mb-2">
                      Currently shared with:
                    </p>
                    <ul className="text-sm">
                      {sharedUsers.map((user) => (
                        <li
                          key={user}
                          className="py-1.5 px-3 flex items-center justify-between text-gray-700 bg-gray-50 rounded-md mb-1.5"
                        >
                          <div className="flex items-center">
                            <IconUserCheck
                              size={16}
                              className="mr-2 text-gray-500"
                            />
                            {user}
                          </div>

                          {confirmRemoveUser === user ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setConfirmRemoveUser(null)}
                                className="text-gray-500 hover:text-gray-700 p-0.5"
                                disabled={isRemovingUser}
                              >
                                <IconX size={16} />
                              </button>
                              <button
                                onClick={() => handleRemoveUser(user)}
                                className="text-red-500 hover:text-red-700 p-0.5"
                                disabled={isRemovingUser}
                              >
                                <IconCheck size={16} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmRemoveUser(user)}
                              className="text-gray-400 hover:text-red-500 p-0.5"
                              disabled={isRemovingUser}
                            >
                              <IconUserX size={16} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-2 text-xs text-gray-500 flex items-center">
                      <IconLink size={14} className="mr-1" />
                      <a
                        href="/profile"
                        className="text-mercedes-primary hover:underline"
                      >
                        Go to your profile to manage all shared notes
                      </a>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-between mt-6">
                  {isPublic && (
                    <button
                      onClick={handleShareNote}
                      disabled={isSharing}
                      className={`w-full py-2 px-4 bg-mercedes-primary text-white rounded-md ${
                        isSharing ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      {isSharing
                        ? "Sharing..."
                        : shortcode
                          ? "Update Public Share"
                          : "Share Publicly"}
                    </button>
                  )}

                  {!isPublic && !shareUsername.trim() && (
                    <button
                      onClick={() => setIsShareModalOpen(false)}
                      className="w-full py-2 px-4 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Close
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
