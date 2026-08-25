"use server";

import { createClient } from "@/utils/supabase/server";
import { uploadToR2, deleteFromR2, r2PublicUrl, isR2Configured } from "@/utils/storage/r2";

const BUCKET_NAME = "notebook-covers";
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** R2 object key for a notebook's cover (deterministic → re-uploads overwrite). */
function coverKey(userId: string, notebookId: string): string {
  return `covers/${userId}/${notebookId}`;
}

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

/**
 * Creates a signed URL for direct client-side upload to Supabase Storage.
 * This bypasses the server action payload limit.
 */
export async function createUploadUrl(
  notebookId: string,
  fileType: string,
  fileName: string,
): Promise<{
  success: boolean;
  signedUrl?: string;
  path?: string;
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    // Validate file type
    if (!ALLOWED_TYPES.includes(fileType)) {
      return {
        success: false,
        error: "Invalid file type. Allowed: JPEG, PNG, WebP",
      };
    }

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

    // Generate unique filename
    const ext = fileName.split(".").pop() || "jpg";
    const path = `${userId}/${notebookId}-${Date.now()}.${ext}`;

    // Create signed URL for upload (valid for 2 minutes)
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(path);

    if (error) {
      console.error("Failed to create signed URL:", error);
      return {
        success: false,
        error: `Failed to create upload URL: ${error.message}`,
      };
    }

    return {
      success: true,
      signedUrl: data.signedUrl,
      path: path,
    };
  } catch (error) {
    console.error("Failed to create upload URL:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to create upload URL: ${errorMessage}`,
    };
  }
}

/**
 * Confirms the upload and updates the notebook with the new cover URL.
 */
export async function confirmCoverUpload(
  notebookId: string,
  path: string,
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

    // Get the public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);

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
    console.error("Failed to confirm cover upload:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to confirm upload: ${errorMessage}`,
    };
  }
}

/**
 * Uploads a notebook cover to Cloudflare R2 and saves the URL on the notebook.
 * Deterministic key (covers/<userId>/<notebookId>) so re-uploads overwrite;
 * a ?v= query busts caches. This is the active cover-upload path.
 */
export async function uploadNotebookCoverR2(
  notebookId: string,
  formData: FormData,
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    if (!isR2Configured()) {
      return { success: false, error: "Image storage isn't configured." };
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false, error: "No image provided." };
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { success: false, error: "Use a JPEG, PNG, or WebP image." };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: "Image is too large (max 2MB)." };
    }

    // Verify ownership before writing anything.
    const { data: notebook, error: notebookError } = await supabase
      .from("notebooks")
      .select("id")
      .eq("id", notebookId)
      .eq("owner", userId)
      .single();
    if (notebookError || !notebook) {
      return { success: false, error: "Notebook not found or access denied." };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = coverKey(userId, notebookId);
    await uploadToR2(key, buffer, file.type);
    const url = `${r2PublicUrl(key)}?v=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("notebooks")
      .update({
        cover_type: "custom",
        cover_value: url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", notebookId)
      .eq("owner", userId);
    if (updateError) {
      console.error("Cover saved to R2 but notebook update failed:", updateError);
      return { success: false, error: "Uploaded, but couldn't update the notebook." };
    }

    return { success: true, url };
  } catch (error) {
    console.error("Notebook cover upload failed:", error);
    return { success: false, error: "Failed to upload the cover." };
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

    // Only delete from storage if it's a custom cover.
    if (notebook.cover_type === "custom" && coverUrl) {
      await deleteFromR2(coverKey(userId, notebookId));
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
