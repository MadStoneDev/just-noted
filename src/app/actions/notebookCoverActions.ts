"use server";

import { createClient } from "@/utils/supabase/server";

const BUCKET_NAME = "notebook-covers";
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// ===========================
// AUTHENTICATION HELPER
// ===========================
async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.getUser();

  if (error || !authData.user?.id) {
    throw new Error("User not authenticated");
  }

  return { supabase, userId: authData.user.id };
}

// ===========================
// COVER UPLOAD OPERATIONS
// ===========================

export async function uploadNotebookCover(
  notebookId: string,
  formData: FormData,
): Promise<{
  success: boolean;
  url?: string;
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    // Verify the user owns this notebook
    const { data: notebook, error: notebookError } = await supabase
      .from("notebooks")
      .select("id")
      .eq("id", notebookId)
      .eq("owner", userId)
      .single();

    if (notebookError || !notebook) {
      return {
        success: false,
        error: "Notebook not found or access denied",
      };
    }

    const file = formData.get("file") as File;

    if (!file) {
      return {
        success: false,
        error: "No file provided",
      };
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        success: false,
        error: "Invalid file type. Allowed: JPEG, PNG, WebP",
      };
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: "File too large. Maximum size is 2MB",
      };
    }

    // Generate unique filename
    const ext = file.name.split(".").pop() || "jpg";
    const filename = `${userId}/${notebookId}-${Date.now()}.${ext}`;

    // Delete any existing cover for this notebook first
    const { data: existingFiles } = await supabase.storage
      .from(BUCKET_NAME)
      .list(userId, {
        search: notebookId,
      });

    if (existingFiles && existingFiles.length > 0) {
      const filesToDelete = existingFiles.map((f) => `${userId}/${f.name}`);
      await supabase.storage.from(BUCKET_NAME).remove(filesToDelete);
    }

    // Upload the new file
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return {
        success: false,
        error: `Upload failed: ${uploadError.message}`,
      };
    }

    // Get the public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filename);

    // Update the notebook with the new cover
    const { error: updateError } = await supabase
      .from("notebooks")
      .update({
        cover_type: "custom",
        cover_value: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", notebookId)
      .eq("owner", userId);

    if (updateError) {
      console.error("Failed to update notebook cover:", updateError);
      // Try to clean up the uploaded file
      await supabase.storage.from(BUCKET_NAME).remove([filename]);
      return {
        success: false,
        error: `Failed to update notebook: ${updateError.message}`,
      };
    }

    return {
      success: true,
      url: publicUrl,
    };
  } catch (error) {
    console.error("Failed to upload notebook cover:", error);
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Upload failed: ${errorMessage}`,
    };
  }
}

export async function deleteNotebookCover(
  notebookId: string,
  coverUrl: string,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    // Verify the user owns this notebook
    const { data: notebook, error: notebookError } = await supabase
      .from("notebooks")
      .select("id, cover_type")
      .eq("id", notebookId)
      .eq("owner", userId)
      .single();

    if (notebookError || !notebook) {
      return {
        success: false,
        error: "Notebook not found or access denied",
      };
    }

    // Only delete from storage if it's a custom cover
    if (notebook.cover_type === "custom" && coverUrl) {
      // Extract the file path from the URL
      const urlParts = coverUrl.split(`${BUCKET_NAME}/`);
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        await supabase.storage.from(BUCKET_NAME).remove([filePath]);
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to delete notebook cover:", error);
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Delete failed: ${errorMessage}`,
    };
  }
}
