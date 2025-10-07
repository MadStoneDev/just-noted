// src/components/share-note-button.tsx
"use client";

import React, { useState, useEffect, useReducer, useCallback } from "react";
import {
  IconShare2,
  IconUsers,
  IconWorld,
  IconUserCheck,
  IconUserX,
  IconCopy,
  IconCheck,
  IconLink,
  IconX,
} from "@tabler/icons-react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { sharingOperation } from "@/app/actions/sharing";
import { createClient } from "@/utils/supabase/client";

interface ShareNoteButtonProps {
  noteId: string;
  noteTitle: string;
  noteSource: "redis" | "supabase";
  isPrivate: boolean;
  isAuthenticated: boolean;
  userId: string;
}

// State type
interface ShareState {
  isModalOpen: boolean;
  isPublic: boolean;
  username: string;
  isSharing: boolean;
  isLoadingInfo: boolean;
  isRemovingUser: boolean;
  shortcode: string | null;
  sharedUsers: string[];
  isCopied: boolean;
  confirmRemoveUser: string | null;
}

// Action types
type ShareAction =
  | { type: "OPEN_MODAL" }
  | { type: "CLOSE_MODAL" }
  | { type: "SET_PUBLIC"; payload: boolean }
  | { type: "SET_USERNAME"; payload: string }
  | { type: "SET_SHARING"; payload: boolean }
  | { type: "SET_LOADING_INFO"; payload: boolean }
  | { type: "SET_REMOVING_USER"; payload: boolean }
  | { type: "SET_SHORTCODE"; payload: string | null }
  | { type: "SET_SHARED_USERS"; payload: string[] }
  | { type: "ADD_SHARED_USER"; payload: string }
  | { type: "REMOVE_SHARED_USER"; payload: string }
  | { type: "SET_COPIED"; payload: boolean }
  | { type: "SET_CONFIRM_REMOVE"; payload: string | null }
  | { type: "RESET_MODAL" }
  | {
      type: "LOAD_SHARE_INFO";
      payload: { isPublic: boolean; shortcode: string; users: string[] };
    };

// Reducer
function shareReducer(state: ShareState, action: ShareAction): ShareState {
  switch (action.type) {
    case "OPEN_MODAL":
      return { ...state, isModalOpen: true };
    case "CLOSE_MODAL":
      return { ...state, isModalOpen: false };
    case "SET_PUBLIC":
      return { ...state, isPublic: action.payload };
    case "SET_USERNAME":
      return { ...state, username: action.payload };
    case "SET_SHARING":
      return { ...state, isSharing: action.payload };
    case "SET_LOADING_INFO":
      return { ...state, isLoadingInfo: action.payload };
    case "SET_REMOVING_USER":
      return { ...state, isRemovingUser: action.payload };
    case "SET_SHORTCODE":
      return { ...state, shortcode: action.payload };
    case "SET_SHARED_USERS":
      return { ...state, sharedUsers: action.payload };
    case "ADD_SHARED_USER":
      return {
        ...state,
        sharedUsers: [...state.sharedUsers, action.payload],
      };
    case "REMOVE_SHARED_USER":
      return {
        ...state,
        sharedUsers: state.sharedUsers.filter((u) => u !== action.payload),
      };
    case "SET_COPIED":
      return { ...state, isCopied: action.payload };
    case "SET_CONFIRM_REMOVE":
      return { ...state, confirmRemoveUser: action.payload };
    case "RESET_MODAL":
      return {
        ...state,
        username: "",
        isSharing: false,
        confirmRemoveUser: null,
      };
    case "LOAD_SHARE_INFO":
      return {
        ...state,
        isPublic: action.payload.isPublic,
        shortcode: action.payload.shortcode,
        sharedUsers: action.payload.users,
        isLoadingInfo: false,
      };
    default:
      return state;
  }
}

// Initial state
const initialState: ShareState = {
  isModalOpen: false,
  isPublic: true,
  username: "",
  isSharing: false,
  isLoadingInfo: false,
  isRemovingUser: false,
  shortcode: null,
  sharedUsers: [],
  isCopied: false,
  confirmRemoveUser: null,
};

export default function ShareNoteButton({
  noteId,
  noteTitle,
  noteSource,
  isAuthenticated,
  isPrivate = false,
  userId,
}: ShareNoteButtonProps) {
  const [state, dispatch] = useReducer(shareReducer, initialState);
  const [currentUserId, setCurrentUserId] = useState<string>(userId);
  const { showSuccess, showError } = useToast();
  const supabase = createClient();

  // Get correct user ID
  useEffect(() => {
    const getCurrentUserId = async () => {
      if (noteSource === "supabase" && isAuthenticated) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          setCurrentUserId(user.id);
        }
      } else {
        setCurrentUserId(userId);
      }
    };

    getCurrentUserId();
  }, [noteSource, isAuthenticated, userId, supabase]);

  // Fetch initial share status
  useEffect(() => {
    const fetchInitialShareStatus = async () => {
      if (isAuthenticated && noteId && currentUserId) {
        try {
          const result = await sharingOperation({
            operation: "getUsers",
            noteId,
            currentUserId,
          });

          if (result.success && result.shortcode) {
            dispatch({ type: "SET_SHORTCODE", payload: result.shortcode });
          }
        } catch (error) {
          console.error("Error fetching initial share status:", error);
        }
      }
    };

    fetchInitialShareStatus();
  }, [isAuthenticated, noteId, currentUserId]);

  // Open modal and load share info
  const handleOpenModal = useCallback(async () => {
    dispatch({ type: "OPEN_MODAL" });
    dispatch({ type: "RESET_MODAL" });
    dispatch({ type: "SET_LOADING_INFO", payload: true });

    if (isAuthenticated) {
      try {
        const result = await sharingOperation({
          operation: "getUsers",
          noteId,
          currentUserId,
        });

        if (result.success) {
          dispatch({
            type: "LOAD_SHARE_INFO",
            payload: {
              isPublic: result.isPublic || false,
              shortcode: result.shortcode || null,
              users: result.users || [],
            },
          });
        } else {
          dispatch({ type: "SET_LOADING_INFO", payload: false });
        }
      } catch (error) {
        console.error("Error fetching share info:", error);
        dispatch({ type: "SET_LOADING_INFO", payload: false });
      }
    } else {
      dispatch({ type: "SET_LOADING_INFO", payload: false });
    }
  }, [isAuthenticated, noteId, currentUserId]);

  const handleCloseModal = useCallback(() => {
    dispatch({ type: "CLOSE_MODAL" });
  }, []);

  // Handle share type change
  const handleTypeChange = useCallback((isPublic: boolean) => {
    dispatch({ type: "SET_PUBLIC", payload: isPublic });
  }, []);

  // Handle username input
  const handleUsernameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      dispatch({ type: "SET_USERNAME", payload: e.target.value });
    },
    [],
  );

  // Handle share note
  const handleShareNote = useCallback(async () => {
    if (!isAuthenticated) {
      showError("You must be signed in to share notes");
      return;
    }

    dispatch({ type: "SET_SHARING", payload: true });

    try {
      const result = await sharingOperation({
        operation: "share",
        noteId,
        isPublic: state.isPublic,
        username: state.isPublic ? null : state.username,
        currentUserId: currentUserId,
        storage: noteSource,
      });

      if (result.success) {
        showSuccess(
          state.isPublic
            ? "Note shared publicly!"
            : `Note shared with ${state.username}!`,
        );
        dispatch({ type: "SET_SHORTCODE", payload: result.shortcode });

        // Update shared users list if sharing privately
        if (!state.isPublic && state.username) {
          dispatch({ type: "ADD_SHARED_USER", payload: state.username });
          dispatch({ type: "SET_USERNAME", payload: "" });
        }
      } else {
        showError(result.error || "Failed to share note");
      }
    } catch (error) {
      console.error("Error sharing note:", error);
      showError("An unexpected error occurred");
    } finally {
      dispatch({ type: "SET_SHARING", payload: false });
    }
  }, [
    isAuthenticated,
    noteId,
    state.isPublic,
    state.username,
    currentUserId,
    noteSource,
    showSuccess,
    showError,
  ]);

  // Handle remove user
  const handleRemoveUserClick = useCallback((username: string) => {
    dispatch({ type: "SET_CONFIRM_REMOVE", payload: username });
  }, []);

  const handleRemoveUserConfirm = useCallback(async () => {
    const username = state.confirmRemoveUser;
    if (!username || !isAuthenticated || !currentUserId) {
      showError("You must be signed in to manage shared notes");
      return;
    }

    dispatch({ type: "SET_REMOVING_USER", payload: true });

    try {
      const result = await sharingOperation({
        operation: "removeUser",
        noteId,
        username,
        currentUserId: currentUserId,
      });

      if (result.success) {
        dispatch({ type: "REMOVE_SHARED_USER", payload: username });
        showSuccess(`Access removed for ${username}`);
      } else {
        showError(result.error || "Failed to remove user");
      }
    } catch (error) {
      console.error("Error removing user:", error);
      showError("An unexpected error occurred");
    } finally {
      dispatch({ type: "SET_REMOVING_USER", payload: false });
      dispatch({ type: "SET_CONFIRM_REMOVE", payload: null });
    }
  }, [
    state.confirmRemoveUser,
    isAuthenticated,
    currentUserId,
    noteId,
    showSuccess,
    showError,
  ]);

  const handleRemoveUserCancel = useCallback(() => {
    dispatch({ type: "SET_CONFIRM_REMOVE", payload: null });
  }, []);

  // Copy link to clipboard
  const handleCopyLink = useCallback(() => {
    if (!state.shortcode) return;

    const shareUrl = `${window.location.origin}/${state.shortcode}`;
    navigator.clipboard.writeText(shareUrl);
    dispatch({ type: "SET_COPIED", payload: true });
    setTimeout(() => {
      dispatch({ type: "SET_COPIED", payload: false });
    }, 2000);
  }, [state.shortcode]);

  const canShare = isAuthenticated;

  return (
    <>
      <button
        type="button"
        onClick={handleOpenModal}
        disabled={!canShare}
        className={`group/share px-2 cursor-pointer flex-grow sm:flex-grow-0 flex items-center justify-center gap-0 md:hover:gap-2 w-fit min-w-10 h-10 rounded-lg border-1 ${
          isPrivate
            ? "border-violet-800 hover:bg-violet-800 hover:text-neutral-100"
            : canShare
              ? state.shortcode
                ? "bg-white border-mercedes-primary text-mercedes-primary hover:bg-mercedes-primary hover:text-white"
                : "border-neutral-500 hover:border-mercedes-primary hover:bg-mercedes-primary text-neutral-800"
              : "opacity-50 cursor-not-allowed border-neutral-300"
        } overflow-hidden transition-all duration-300 ease-in-out`}
        title={!canShare ? "Sign in to share notes" : "Share this note"}
      >
        <IconShare2 size={20} strokeWidth={2} />
        <span className="w-fit max-w-0 md:group-hover/share:max-w-52 opacity-0 md:group-hover/share:opacity-100 overflow-hidden transition-all duration-300 ease-in-out">
          Share Note
        </span>
      </button>

      {/* Share Modal */}
      <Modal
        isOpen={state.isModalOpen}
        onClose={handleCloseModal}
        title="Share Note"
        size="md"
      >
        {state.isLoadingInfo ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin h-8 w-8 border-4 border-mercedes-primary border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Sharing <strong>{noteTitle}</strong>
            </p>

            {/* Share Type Selection */}
            <div className="flex justify-center space-x-4">
              <ShareTypeButton
                type="public"
                icon={<IconWorld size={24} />}
                label="Public"
                isActive={state.isPublic}
                onClick={() => handleTypeChange(true)}
              />
              <ShareTypeButton
                type="private"
                icon={<IconUsers size={24} />}
                label="Specific Users"
                isActive={!state.isPublic}
                onClick={() => handleTypeChange(false)}
              />
            </div>

            {/* Share Link */}
            {state.shortcode && (
              <ShareLinkDisplay
                shortcode={state.shortcode}
                isCopied={state.isCopied}
                onCopy={handleCopyLink}
              />
            )}

            {/* User Input for Private Sharing */}
            {!state.isPublic && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Share with username:
                </label>
                <div className="flex">
                  <input
                    type="text"
                    value={state.username}
                    onChange={handleUsernameChange}
                    placeholder="Enter username"
                    className="flex-grow p-2 border rounded-l-md"
                  />
                  <button
                    onClick={handleShareNote}
                    disabled={state.isSharing || !state.username.trim()}
                    className={`p-2 bg-mercedes-primary text-white rounded-r-md ${
                      state.isSharing || !state.username.trim()
                        ? "opacity-50"
                        : ""
                    }`}
                  >
                    {state.isSharing ? "Sharing..." : "Share"}
                  </button>
                </div>
              </div>
            )}

            {/* Shared Users List */}
            {state.sharedUsers.length > 0 && (
              <SharedUsersList
                users={state.sharedUsers}
                confirmRemoveUser={state.confirmRemoveUser}
                isRemovingUser={state.isRemovingUser}
                onRemoveClick={handleRemoveUserClick}
                onRemoveConfirm={handleRemoveUserConfirm}
                onRemoveCancel={handleRemoveUserCancel}
              />
            )}

            {/* Action Button for Public Sharing */}
            {state.isPublic && (
              <button
                onClick={handleShareNote}
                disabled={state.isSharing}
                className={`w-full py-2 px-4 bg-mercedes-primary text-white rounded-md ${
                  state.isSharing ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                {state.isSharing
                  ? "Sharing..."
                  : state.shortcode
                    ? "Update Public Share"
                    : "Share Publicly"}
              </button>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

// Extracted Sub-Components

const ShareTypeButton = React.memo(function ShareTypeButton({
  type,
  icon,
  label,
  isActive,
  onClick,
}: {
  type: "public" | "private";
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center p-3 rounded-lg border ${
        isActive
          ? "border-mercedes-primary bg-mercedes-primary/10"
          : "border-gray-200"
      }`}
    >
      <div className={isActive ? "text-mercedes-primary" : "text-gray-500"}>
        {icon}
      </div>
      <span
        className={`text-sm mt-1 ${
          isActive ? "text-mercedes-primary" : "text-gray-500"
        }`}
      >
        {label}
      </span>
    </button>
  );
});

const ShareLinkDisplay = React.memo(function ShareLinkDisplay({
  shortcode,
  isCopied,
  onCopy,
}: {
  shortcode: string;
  isCopied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="p-3 bg-gray-100 rounded-lg">
      <p className="text-sm font-medium mb-2">Share Link:</p>
      <div className="flex items-center">
        <input
          readOnly
          value={`${process.env.NEXT_PUBLIC_APP_URL}/${shortcode}`}
          className="flex-grow p-2 border rounded-l-md text-sm bg-white"
        />
        <button
          onClick={onCopy}
          className="p-2 bg-mercedes-primary text-white rounded-r-md"
        >
          {isCopied ? <IconCheck size={18} /> : <IconCopy size={18} />}
        </button>
      </div>
    </div>
  );
});

const SharedUsersList = React.memo(function SharedUsersList({
  users,
  confirmRemoveUser,
  isRemovingUser,
  onRemoveClick,
  onRemoveConfirm,
  onRemoveCancel,
}: {
  users: string[];
  confirmRemoveUser: string | null;
  isRemovingUser: boolean;
  onRemoveClick: (username: string) => void;
  onRemoveConfirm: () => void;
  onRemoveCancel: () => void;
}) {
  return (
    <div className="border-t pt-3">
      <h4 className="text-sm font-medium mb-2">Shared with:</h4>
      <ul className="space-y-1">
        {users.map((username) => (
          <li
            key={username}
            className="flex items-center justify-between text-sm bg-gray-50 px-3 py-1.5 rounded"
          >
            <span>{username}</span>

            {confirmRemoveUser === username ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={onRemoveCancel}
                  className="text-gray-500 hover:text-gray-700 p-0.5"
                  disabled={isRemovingUser}
                >
                  <IconX size={16} />
                </button>
                <button
                  onClick={onRemoveConfirm}
                  className="text-red-500 hover:text-red-700 p-0.5"
                  disabled={isRemovingUser}
                >
                  <IconCheck size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => onRemoveClick(username)}
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

        <a href={"/profile"} className="text-mercedes-primary hover:underline">
          Go to your profile to manage all shared notes
        </a>
      </div>
    </div>
  );
});
