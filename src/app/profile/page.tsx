"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ManageSharedNotes from "@/components/manage-shared-notes";
import { createAuthorRecord } from "@/app/actions/authorActions";

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [originalUsername, setOriginalUsername] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  // Load user data on mount
  useEffect(() => {
    // In your ProfilePage component
    async function loadUserData() {
      try {
        // Check if user is authenticated
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          router.push("/get-access");
          return;
        }

        setUser(user);

        // Get user profile data
        const { data: authorData, error: authorError } = await supabase
          .from("authors")
          .select("username, avatar_url, redis_user_id")
          .eq("id", user.id)
          .single();

        if (authorError && authorError.code === "PGRST116") {
          // Author record not found - create one
          console.log("Author record not found for user, creating...");

          // Check localStorage for redis_user_id
          const redisUserId = localStorage.getItem("redisUserId");

          const { data: newAuthor, error: createError } =
            await createAuthorRecord(user.id, redisUserId || "");

          if (createError) {
            console.error("Failed to create author record:", createError);
            setError("Failed to set up your profile. Please try again.");
          } else if (newAuthor) {
            // Set states with the newly created profile
            setUsername(newAuthor.username || "");
            setOriginalUsername(newAuthor.username || "");
            setAvatarUrl(newAuthor.avatar_url || null);
            console.log(
              "Author record created successfully with username:",
              newAuthor.username,
            );

            // If we used a Redis ID, consider offering to transfer notes
            if (redisUserId) {
              setSuccess(
                "We noticed you have anonymous notes. Want to transfer them to your account?",
              );
              // You could add a UI element here for transferring notes
            }
          }
        } else if (authorError) {
          console.error("Error loading profile:", authorError);
          setError("Failed to load profile data");
        } else if (authorData) {
          setUsername(authorData.username || "");
          setOriginalUsername(authorData.username || "");
          setAvatarUrl(authorData.avatar_url || null);

          // If no Redis ID is associated yet, check localStorage
          if (!authorData.redis_user_id) {
            const redisUserId = localStorage.getItem("redisUserId");
            if (redisUserId) {
              // Associate the Redis ID with the author
              const { error: updateError } = await supabase
                .from("authors")
                .update({ redis_user_id: redisUserId })
                .eq("id", user.id);

              if (!updateError) {
                console.log("Associated Redis user ID with author record");
                // Optionally offer to transfer notes
                setSuccess(
                  "We found your anonymous notes. Want to transfer them to your account?",
                );
              }
            }
          }
        }
      } catch (err) {
        console.error("Error in profile page:", err);
        setError("An unexpected error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    loadUserData();
  }, [router, supabase]);

  // Handle avatar file selection
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

  // Save profile changes
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

  // Handle logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md">
          <div className="animate-pulse">Loading your profile...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 pt-24">
      <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md">
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

        <div className="mt-8 border-t pt-8">
          <ManageSharedNotes />
        </div>

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
      </div>
    </div>
  );
}
