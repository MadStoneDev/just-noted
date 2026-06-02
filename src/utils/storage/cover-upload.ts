import { createClient } from "@/utils/supabase/client";

const BUCKET = "notebook-covers";

export async function uploadNotebookCover(
  notebookId: string,
  file: File,
): Promise<string | null> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) return null;

    const userId = user.id;
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `${userId}/${notebookId}-${Date.now()}.${ext}`;

    const { data: existingFiles } = await supabase.storage
      .from(BUCKET)
      .list(userId, { search: notebookId });

    if (existingFiles && existingFiles.length > 0) {
      await supabase.storage
        .from(BUCKET)
        .remove(existingFiles.map((f: { name: string }) => `${userId}/${f.name}`));
    }

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, arrayBuffer, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      console.error("Cover upload error:", uploadError.message);
      return null;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error("Cover upload failed:", error);
    return null;
  }
}
