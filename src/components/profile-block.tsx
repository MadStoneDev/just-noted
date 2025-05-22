"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ManageSharedNotes from "./manage-shared-notes";

interface ProfileBlockProps {
  user: any;
  authorData: any;
}

export default function ProfileBlock({ user, authorData }: ProfileBlockProps) {
  const [username, setUsername] = useState(authorData?.username || "");
  const [originalUsername, setOriginalUsername] = useState(
    authorData?.username || "",
  );

  const [isLoading, setIsLoading] = useState(!authorData); // Loading if no authorData provided
  const [isSaving, setIsSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [avatarUrl, setAvatarUrl] = useState<string>(
    authorData?.avatar_url || "",
  );
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"profile" | "shared">("profile");

  // Hooks
  const supabase = createClient();
  const router = useRouter();

  // Username validation function
  const validateUsername = (username: string): string | null => {
    const trimmed = username.trim();

    if (!trimmed) {
      return "Username cannot be empty";
    }

    if (trimmed.length < 3) {
      return "Username must be at least 3 characters long";
    }

    if (trimmed.length > 30) {
      return "Username must be no more than 30 characters long";
    }

    // Check if username starts with underscore
    if (trimmed.startsWith("_")) {
      return "Username cannot start with an underscore";
    }

    // Check for valid characters (alphanumeric and underscores only)
    const validUsernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!validUsernameRegex.test(trimmed)) {
      return "Username can only contain letters, numbers, and underscores";
    }

    return null; // Valid username
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;

    // Remove spaces and special characters except underscores
    value = value.replace(/[^a-zA-Z0-9_]/g, "");

    // Prevent starting with underscore
    if (value.startsWith("_")) {
      value = value.substring(1);
    }

    if (value.endsWith("_")) {
      value = value.substring(0, value.length - 1);
    }

    setUsername(value);
  };

  // Ensure author row exists on component load
  useEffect(() => {
    const ensureAuthorExists = async () => {
      if (!user?.id) return;

      // If we already have authorData, we're good
      if (authorData?.id) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        // Check if author row exists
        const { data: existingAuthor, error: checkError } = await supabase
          .from("authors")
          .select("*")
          .eq("id", user.id)
          .single();

        if (existingAuthor) {
          // Author exists, update state
          setUsername(existingAuthor.username || "");
          setOriginalUsername(existingAuthor.username || "");
          setAvatarUrl(existingAuthor.avatar_url || "");
        } else if (checkError?.code === "PGRST116") {
          const { data: newAuthor, error: createError } = await supabase.rpc(
            "create_author_with_random_username",
            { user_id: user.id },
          );

          if (createError) {
            setError("Failed to create user profile. Please refresh the page.");
          } else {
            setUsername(newAuthor.username || "");
            setOriginalUsername(newAuthor.username || "");
            setAvatarUrl(newAuthor.avatar_url || "");
            setSuccess("Profile created successfully!");
          }
        } else {
          // Some other error occurred
          console.error("Error checking for author:", checkError);
          setError("Failed to load profile. Please refresh the page.");
        }
      } catch (err) {
        console.error("Error ensuring author exists:", err);
        setError("An unexpected error occurred. Please refresh the page.");
      } finally {
        setIsLoading(false);
      }
    };

    ensureAuthorExists();
  }, [user?.id, authorData, supabase]);

  // Functions
  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Strip whitespace from username
      const trimmedUsername = username.trim();

      // Validate username format
      const validationError = validateUsername(trimmedUsername);
      if (validationError) {
        setError(validationError);
        setIsSaving(false);
        return;
      }

      // Check if username is being changed (case-insensitive comparison)
      if (trimmedUsername.toLowerCase() !== originalUsername.toLowerCase()) {
        // Check if username is already taken (case-insensitive)
        const { data: existingUser, error: checkError } = await supabase
          .from("authors")
          .select("id")
          .ilike("username", trimmedUsername); // Case-insensitive search

        if (checkError) {
          setError("Something went wrong checking username availability");
          setIsSaving(false);
          return;
        }

        if (existingUser && existingUser.length > 0) {
          setError(
            "This username is already taken (usernames are case-insensitive)",
          );
          setIsSaving(false);
          return;
        }
      }

      // Upload avatar if changed
      let newAvatarUrl = avatarUrl;

      if (avatarFile) {
        const fileExt = avatarFile.name.split(".").pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, avatarFile);

        if (uploadError) {
          console.error("Error uploading avatar:", uploadError);
          setError("Failed to upload avatar");
          setIsSaving(false);
          return;
        }

        // Get the public URL
        const { data: publicUrl } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

        newAvatarUrl = publicUrl.publicUrl;
      }

      // Update profile in database (use trimmed username)
      const { error: updateError } = await supabase
        .from("authors")
        .update({
          username: trimmedUsername,
          avatar_url: newAvatarUrl,
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("Error updating profile:", updateError);
        setError("Failed to update profile");
      } else {
        setOriginalUsername(trimmedUsername);
        setUsername(trimmedUsername); // Update state with trimmed version
        setAvatarUrl(newAvatarUrl);
        setAvatarFile(null);
        setAvatarPreview(null);
        setSuccess("Profile updated successfully");
      }
    } catch (err) {
      console.error("Error saving profile:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      setAvatarFile(null);
      setAvatarPreview(null);
      return;
    }

    const file = e.target.files[0];
    setAvatarFile(file);

    // Create a preview
    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);

    // Clean up preview URL when component unmounts
    return () => URL.revokeObjectURL(objectUrl);
  };

  // Handle logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  // Show loading state while checking/creating author
  if (isLoading) {
    return (
      <main className="flex-grow py-8 px-4">
        <div className="mx-auto max-w-4xl">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-mercedes-primary mx-auto mb-4"></div>
                <p className="text-gray-600">Setting up your profile...</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-grow py-8 px-4">
      <div className="mx-auto max-w-4xl">
        <div className="flex mb-6 border-b">
          <button
            onClick={() => setActiveTab("profile")}
            className={`px-4 py-2 font-medium ${
              activeTab === "profile"
                ? "border-b-2 border-mercedes-primary text-mercedes-primary"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Your Profile
          </button>
          <button
            onClick={() => setActiveTab("shared")}
            className={`px-4 py-2 font-medium ${
              activeTab === "shared"
                ? "border-b-2 border-mercedes-primary text-mercedes-primary"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Shared Notes
          </button>
        </div>

        {activeTab === "profile" ? (
          <section className="bg-white p-6 rounded-lg shadow-md">
            <h1 className="text-2xl font-bold mb-6">Your Profile</h1>

            {error && (
              <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-md">
                {success}
              </div>
            )}

            <div className="mb-6">
              <label className="block mb-2 text-sm font-medium">Email</label>
              <div className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50">
                {user?.email}
              </div>
            </div>

            <div className="mb-6">
              <label className="block mb-2 text-sm font-medium">Username</label>
              <input
                type="text"
                value={username}
                onChange={handleUsernameChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-mercedes-primary"
                placeholder="Enter username"
                maxLength={30}
              />
              <p className="mt-1 text-sm text-gray-500">
                Username can only contain letters, numbers, and underscores.
                Cannot start with underscore. (3-30 characters)
              </p>
            </div>

            <div className="mb-6">
              <label className="block mb-2 text-sm font-medium">Avatar</label>

              <div className="flex items-center space-x-4">
                <div
                  className="shrink-0 w-20 h-20 bg-gray-200 rounded-full overflow-hidden flex items-center justify-center"
                  style={{
                    aspectRatio: 1,
                  }}
                >
                  {avatarPreview || avatarUrl ? (
                    <img
                      src={avatarPreview || avatarUrl || ""}
                      alt="Avatar preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-400 text-5xl">?</span>
                  )}
                </div>

                <div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-md file:border-0
                      file:text-sm file:font-semibold
                      file:bg-mercedes-primary file:text-white
                      hover:file:bg-mercedes-secondary"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-between mt-8">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`px-4 py-2 bg-mercedes-primary text-white rounded-md ${
                  isSaving ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>

              <button
                onClick={handleLogout}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Log Out
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <Link href="/" className="text-mercedes-primary hover:underline">
                &larr; Back to Notes
              </Link>
            </div>
          </section>
        ) : (
          <section className="bg-white p-6 rounded-lg shadow-md">
            {user && <ManageSharedNotes userId={user.id} />}

            <div className="mt-6 pt-6 border-t border-gray-200">
              <Link href="/" className="text-mercedes-primary hover:underline">
                &larr; Back to Notes
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
