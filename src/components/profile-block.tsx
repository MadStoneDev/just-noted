"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { router } from "next/client";
import Link from "next/link";

interface ProfileBlockProps {
  user: any;
  authorData: any;
}

export default function ProfileBlock({ user, authorData }: ProfileBlockProps) {
  const [username, setUsername] = useState(authorData?.username || "");
  const [originalUsername, setOriginalUsername] = useState(
    authorData?.username || "",
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [avatarUrl, setAvatarUrl] = useState<string>(
    authorData?.avatar_url || "",
  );
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Hooks
  const supabase = createClient();

  // Functions
  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Check if username is being changed
      if (username !== originalUsername) {
        // Check if username is already taken
        const { data: existingUser } = await supabase
          .from("authors")
          .select("id")
          .eq("username", username)
          .single();

        if (existingUser) {
          setError("This username is already taken");
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

      // Update profile in database
      const { error: updateError } = await supabase
        .from("authors")
        .update({
          username: username,
          avatar_url: newAvatarUrl,
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("Error updating profile:", updateError);
        setError("Failed to update profile");
      } else {
        setOriginalUsername(username);
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

  return (
    <main className={`flex-grow`}>
      <section className={`mx-auto max-w-md bg-white p-8 rounded-lg shadow-md`}>
        <h1 className="text-2xl font-bold mb-6">Your Profile</h1>

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
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Enter username"
          />
          <p className="mt-1 text-sm text-gray-500">
            This is how other users will see you when you share notes.
          </p>
        </div>

        <div className="mb-6">
          <label className="block mb-2 text-sm font-medium">Avatar</label>

          <div className="flex items-center space-x-4">
            <div
              className={`shrink-0 w-20 h-20 bg-gray-200 rounded-full overflow-hidden flex items-center justify-center`}
              style={{
                aspectRatio: 1,
              }}
            >
              {avatarPreview || avatarUrl ? (
                <img
                  src={avatarPreview || avatarUrl || ""}
                  alt="Avatar preview"
                  className={`w-full h-full object-cover`}
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

        <div className="mt-8 border-t pt-8">{/*<ManageSharedNotes />*/}</div>

        <div className="flex justify-between">
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
            className="px-4 py-2 border border-gray-300 rounded-md"
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
    </main>
  );
}
