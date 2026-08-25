import { uploadNotebookCoverR2 } from "@/app/actions/notebookCoverActions";

/**
 * Uploads a notebook cover and returns its public URL (or null on failure).
 * Thin client wrapper over the R2 server action — kept as a util so existing
 * callers (`note-wrapper`, `sidebar`) don't need to change.
 */
export async function uploadNotebookCover(
  notebookId: string,
  file: File,
): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadNotebookCoverR2(notebookId, formData);
    if (!result.success || !result.url) {
      console.error("Cover upload failed:", result.error);
      return null;
    }
    return result.url;
  } catch (error) {
    console.error("Cover upload failed:", error);
    return null;
  }
}
