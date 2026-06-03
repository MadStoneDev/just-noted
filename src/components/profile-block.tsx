// src/components/profile-block.tsx
"use client";

import { useEffect, useReducer, useCallback, memo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ManageSharedNotes from "./manage-shared-notes";
import { useToast } from "@/components/ui/toast";

interface ProfileBlockProps {
  user: any;
  authorData: any;
}

// State type
interface ProfileState {
  username: string;
  originalUsername: string;
  isLoading: boolean;
  isSaving: boolean;
  avatarUrl: string;
  avatarFile: File | null;
  avatarPreview: string | null;
  activeTab: "profile" | "shared";
}

// Action types
type ProfileAction =
  | { type: "SET_USERNAME"; payload: string }
  | { type: "SET_ORIGINAL_USERNAME"; payload: string }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_SAVING"; payload: boolean }
  | { type: "SET_AVATAR_URL"; payload: string }
  | { type: "SET_AVATAR_FILE"; payload: File | null }
  | { type: "SET_AVATAR_PREVIEW"; payload: string | null }
  | { type: "SET_ACTIVE_TAB"; payload: "profile" | "shared" }
  | {
      type: "LOAD_AUTHOR_DATA";
      payload: { username: string; avatarUrl: string };
    }
  | { type: "SAVE_SUCCESS"; payload: { username: string; avatarUrl: string } }
  | { type: "CLEAR_AVATAR_CHANGES" };

// Reducer
function profileReducer(
  state: ProfileState,
  action: ProfileAction,
): ProfileState {
  switch (action.type) {
    case "SET_USERNAME":
      return { ...state, username: action.payload };
    case "SET_ORIGINAL_USERNAME":
      return { ...state, originalUsername: action.payload };
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "SET_SAVING":
      return { ...state, isSaving: action.payload };
    case "SET_AVATAR_URL":
      return { ...state, avatarUrl: action.payload };
    case "SET_AVATAR_FILE":
      return { ...state, avatarFile: action.payload };
    case "SET_AVATAR_PREVIEW":
      return { ...state, avatarPreview: action.payload };
    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.payload };
    case "LOAD_AUTHOR_DATA":
      return {
        ...state,
        username: action.payload.username,
        originalUsername: action.payload.username,
        avatarUrl: action.payload.avatarUrl,
        isLoading: false,
      };
    case "SAVE_SUCCESS":
      return {
        ...state,
        originalUsername: action.payload.username,
        username: action.payload.username,
        avatarUrl: action.payload.avatarUrl,
        avatarFile: null,
        avatarPreview: null,
        isSaving: false,
      };
    case "CLEAR_AVATAR_CHANGES":
      return {
        ...state,
        avatarFile: null,
        avatarPreview: null,
      };
    default:
      return state;
  }
}

// Username validation
function validateUsername(username: string): string | null {
  const trimmed = username.trim();

  if (!trimmed) return "Username cannot be empty";
  if (trimmed.length < 3) return "Username must be at least 3 characters long";
  if (trimmed.length > 30)
    return "Username must be no more than 30 characters long";
  if (trimmed.startsWith("_"))
    return "Username cannot start with an underscore";

  const validUsernameRegex = /^[a-zA-Z0-9_]+$/;
  if (!validUsernameRegex.test(trimmed)) {
    return "Username can only contain letters, numbers, and underscores";
  }

  return null;
}

export default function ProfileBlock({ user, authorData }: ProfileBlockProps) {
  const initialState: ProfileState = {
    username: authorData?.username || "",
    originalUsername: authorData?.username || "",
    isLoading: !authorData,
    isSaving: false,
    avatarUrl: authorData?.avatar_url || "",
    avatarFile: null,
    avatarPreview: null,
    activeTab: "profile",
  };

  const [state, dispatch] = useReducer(profileReducer, initialState);
  const { showSuccess, showError } = useToast();
  const supabase = createClient();
  const router = useRouter();

  // Cleanup avatar preview URL
  useEffect(() => {
    return () => {
      if (state.avatarPreview) {
        URL.revokeObjectURL(state.avatarPreview);
      }
    };
  }, [state.avatarPreview]);

  // Ensure author exists
  useEffect(() => {
    const ensureAuthorExists = async () => {
      if (!user?.id) return;

      if (authorData?.id) {
        dispatch({ type: "SET_LOADING", payload: false });
        return;
      }

      try {
        dispatch({ type: "SET_LOADING", payload: true });

        const { data: existingAuthor, error: checkError } = await supabase
          .from("authors")
          .select("*")
          .eq("id", user.id)
          .single();

        if (existingAuthor) {
          dispatch({
            type: "LOAD_AUTHOR_DATA",
            payload: {
              username: existingAuthor.username || "",
              avatarUrl: existingAuthor.avatar_url || "",
            },
          });
        } else if (checkError?.code === "PGRST116") {
          const { data: newAuthor, error: createError } = await supabase.rpc(
            "create_author_with_random_username",
            { user_id: user.id },
          );

          if (createError) {
            showError(
              "Failed to create user profile. Please refresh the page.",
            );
          } else {
            dispatch({
              type: "LOAD_AUTHOR_DATA",
              payload: {
                username: newAuthor.username || "",
                avatarUrl: newAuthor.avatar_url || "",
              },
            });
            showSuccess("Profile created successfully!");
          }
        } else {
          console.error("Error checking for author:", checkError);
          showError("Failed to load profile. Please refresh the page.");
        }
      } catch (err) {
        console.error("Error ensuring author exists:", err);
        showError("An unexpected error occurred. Please refresh the page.");
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    };

    ensureAuthorExists();
  }, [user?.id, authorData, supabase, showSuccess, showError]);

  // Handle username change
  const handleUsernameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let value = e.target.value;

      // Remove spaces and special characters except underscores
      value = value.replace(/[^a-zA-Z0-9_]/g, "");

      // Prevent starting/ending with underscore
      if (value.startsWith("_")) value = value.substring(1);
      if (value.endsWith("_")) value = value.substring(0, value.length - 1);

      dispatch({ type: "SET_USERNAME", payload: value });
    },
    [],
  );

  // Handle avatar change
  const handleAvatarChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) {
        dispatch({ type: "SET_AVATAR_FILE", payload: null });
        dispatch({ type: "SET_AVATAR_PREVIEW", payload: null });
        return;
      }

      const file = e.target.files[0];
      dispatch({ type: "SET_AVATAR_FILE", payload: file });

      const objectUrl = URL.createObjectURL(file);
      dispatch({ type: "SET_AVATAR_PREVIEW", payload: objectUrl });
    },
    [],
  );

  // Handle save
  const handleSave = useCallback(async () => {
    if (!user) return;

    dispatch({ type: "SET_SAVING", payload: true });

    try {
      const trimmedUsername = state.username.trim();

      // Validate username
      const validationError = validateUsername(trimmedUsername);
      if (validationError) {
        showError(validationError);
        dispatch({ type: "SET_SAVING", payload: false });
        return;
      }

      // Check if username changed and is already taken
      if (
        trimmedUsername.toLowerCase() !== state.originalUsername.toLowerCase()
      ) {
        const { data: existingUser, error: checkError } = await supabase
          .from("authors")
          .select("id")
          .ilike("username", trimmedUsername);

        if (checkError) {
          showError("Something went wrong checking username availability");
          dispatch({ type: "SET_SAVING", payload: false });
          return;
        }

        if (existingUser && existingUser.length > 0) {
          showError(
            "This username is already taken (usernames are case-insensitive)",
          );
          dispatch({ type: "SET_SAVING", payload: false });
          return;
        }
      }

      // Upload avatar if changed
      let newAvatarUrl = state.avatarUrl;

      if (state.avatarFile) {
        const fileExt = state.avatarFile.name.split(".").pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, state.avatarFile);

        if (uploadError) {
          console.error("Error uploading avatar:", uploadError);
          showError("Failed to upload avatar");
          dispatch({ type: "SET_SAVING", payload: false });
          return;
        }

        const { data: publicUrl } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

        newAvatarUrl = publicUrl.publicUrl;
      }

      // Update profile
      const { error: updateError } = await supabase
        .from("authors")
        .update({
          username: trimmedUsername,
          avatar_url: newAvatarUrl,
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("Error updating profile:", updateError);
        showError("Failed to update profile");
        dispatch({ type: "SET_SAVING", payload: false });
      } else {
        dispatch({
          type: "SAVE_SUCCESS",
          payload: {
            username: trimmedUsername,
            avatarUrl: newAvatarUrl,
          },
        });
        showSuccess("Profile updated successfully");
      }
    } catch (err) {
      console.error("Error saving profile:", err);
      showError("An unexpected error occurred");
      dispatch({ type: "SET_SAVING", payload: false });
    }
  }, [
    user,
    state.username,
    state.originalUsername,
    state.avatarUrl,
    state.avatarFile,
    supabase,
    showSuccess,
    showError,
  ]);

  // Handle logout
  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/");
  }, [supabase, router]);

  // Handle tab change
  const handleTabChange = useCallback((tab: "profile" | "shared") => {
    dispatch({ type: "SET_ACTIVE_TAB", payload: tab });
  }, []);

  const hasChanges =
    state.username !== state.originalUsername || state.avatarFile !== null;

  if (state.isLoading) {
    return (
      <div className="py-16 text-center">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--color-accent)] border-t-transparent mx-auto mb-3"></div>
        <p className="text-sm text-[var(--color-text-tertiary)]">Loading profile...</p>
      </div>
    );
  }

  return (
    <div>
      <div>
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 bg-[var(--color-bg-tertiary)] rounded-full flex items-center justify-center shrink-0 overflow-hidden">
            {state.avatarPreview || state.avatarUrl ? (
              <img
                src={state.avatarPreview || state.avatarUrl || ""}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[var(--color-text-tertiary)] text-xl font-light">?</span>
            )}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {state.username || "Your Profile"}
            </h1>
            <p className="text-xs text-[var(--color-text-tertiary)]">{user?.email}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex mb-4 bg-[var(--color-bg-tertiary)] rounded-[var(--radius-md)] p-0.5">
          <TabButton
            label="Profile Settings"
            isActive={state.activeTab === "profile"}
            onClick={() => handleTabChange("profile")}
          />
          <TabButton
            label="Shared Notes"
            isActive={state.activeTab === "shared"}
            onClick={() => handleTabChange("shared")}
          />
        </div>

        {state.activeTab === "profile" ? (
          <section>
            <div>
              <h2 className="text-sm font-semibold mb-4 text-[var(--color-text-primary)]">
                Account Information
              </h2>

              {/* Email Display - Modern card style */}
              <div className="mb-4">
                <label className="block mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
                  Email Address
                </label>
                <div className="px-3 py-2 bg-[var(--color-bg-secondary)] rounded-[var(--radius-md)] border border-[var(--color-border-primary)] text-[var(--color-text-secondary)]">
                  {user?.email}
                </div>
                <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                  Your email is used for authentication and cannot be changed
                  here.
                </p>
              </div>

              {/* Username Input - Enhanced */}
              <div className="mb-4">
                <label className="block mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
                  Username
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={state.username}
                    onChange={handleUsernameChange}
                    className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-md)] focus:outline-none focus:border-[var(--color-accent)] transition-colors bg-[var(--color-bg-primary)]"
                    placeholder="Enter username"
                    maxLength={30}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-tertiary)]">
                    {state.username.length}/30
                  </div>
                </div>
                <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                  Letters, numbers, and underscores only. Must be 3-30
                  characters.
                </p>
              </div>

              {/* Avatar Upload - Card style */}
              <div className="mb-8">
                <label className="block mb-3 text-xs font-medium text-[var(--color-text-secondary)]">
                  Profile Picture
                </label>
                <div className="flex items-center space-x-4 p-5 bg-[var(--color-bg-secondary)] rounded-[var(--radius-md)] border-2 border-dashed border-[var(--color-border-primary)] hover:border-[var(--color-accent)]/50 transition-colors">
                  <div className="shrink-0 w-24 h-24 bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] overflow-hidden flex items-center justify-center shadow-sm ring-1 ring-gray-200">
                    {state.avatarPreview || state.avatarUrl ? (
                      <img
                        src={state.avatarPreview || state.avatarUrl || ""}
                        alt="Avatar preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-[var(--color-text-tertiary)] text-5xl font-light">
                        ?
                      </span>
                    )}
                  </div>

                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      id="avatar-upload"
                      className="hidden"
                    />
                    <label
                      htmlFor="avatar-upload"
                      className="inline-flex items-center px-4 py-2.5 bg-[var(--color-accent)] text-white rounded-[var(--radius-lg)] font-medium cursor-pointer hover:bg-[var(--color-accent)]/90 transition-colors shadow-sm"
                    >
                      <svg
                        className="w-5 h-5 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      Choose Image
                    </label>
                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                      Recommended: Square image, at least 200x200px
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons - Sticky footer */}
            <div className="flex justify-between items-center px-0 py-4 bg-[var(--color-bg-secondary)] border-t border-[var(--color-border-secondary)]">
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-[var(--color-text-primary)] font-medium rounded-[var(--radius-lg)] hover:bg-[var(--color-active)] transition-colors"
              >
                Log Out
              </button>

              <div className="flex items-center space-x-3">
                {hasChanges && (
                  <span className="text-sm text-[var(--color-text-secondary)] mr-2">
                    Unsaved changes
                  </span>
                )}
                <button
                  onClick={handleSave}
                  disabled={state.isSaving || !hasChanges}
                  className={`px-6 py-2.5 rounded-[var(--radius-lg)] font-medium shadow-sm transition-all ${
                    state.isSaving || !hasChanges
                      ? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] cursor-not-allowed"
                      : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 hover:shadow-md"
                  }`}
                >
                  {state.isSaving ? (
                    <span className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                      Saving...
                    </span>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </div>

            {/* Back link */}
            <div className="px-8 py-4 bg-[var(--color-bg-primary)]">
              <Link
                href="/"
                className="inline-flex items-center text-[var(--color-accent)] hover:text-[var(--color-accent)]/80 font-medium transition-colors"
              >
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Back to Notes
              </Link>
            </div>
          </section>
        ) : (
          <section className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] shadow-sm border border-[var(--color-border-secondary)] p-0">
            {user && <ManageSharedNotes userId={user.id} />}

            <div className="mt-8 pt-6 border-t border-[var(--color-border-secondary)]">
              <Link
                href="/"
                className="inline-flex items-center text-[var(--color-accent)] hover:text-[var(--color-accent)]/80 font-medium transition-colors"
              >
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Back to Notes
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// Tab Button Component - Modern pill style
const TabButton = memo(function TabButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-colors ${
        isActive
          ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-xs"
          : "text-[var(--color-text-tertiary)]"
      }`}
    >
      {label}
    </button>
  );
});
