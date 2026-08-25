"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { uploadToR2, r2PublicUrl, isR2Configured } from "@/utils/storage/r2";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

/**
 * Uploads a user's avatar to Cloudflare R2 and saves the URL on their author
 * row. Deterministic key (avatars/<userId>) so re-uploads overwrite; a ?v=
 * query busts caches.
 */
export async function uploadAvatar(
  formData: FormData,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You need to be signed in." };

  if (!isR2Configured()) {
    return { success: false, error: "Image storage isn't configured." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "No image provided." };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { success: false, error: "Use a JPEG, PNG, WebP, or GIF image." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: "Image is too large (max 4MB)." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `avatars/${user.id}`;
    await uploadToR2(key, buffer, file.type);
    const url = `${r2PublicUrl(key)}?v=${Date.now()}`;

    const { error } = await supabase
      .from("authors")
      .update({ avatar_url: url })
      .eq("id", user.id);
    if (error) {
      console.error("Avatar saved to R2 but authors update failed:", error);
      return { success: false, error: "Uploaded, but couldn't save your profile." };
    }

    revalidatePath("/");
    return { success: true, url };
  } catch (e) {
    console.error("Avatar upload failed:", e);
    return { success: false, error: "Failed to upload the image." };
  }
}
