import { uploadNotebookCoverR2 } from "@/app/actions/notebookCoverActions";
import { compressImage } from "@/utils/image/compress";

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
    // Downscale/compress client-side to stay well under the server-action
    // body limit (covers are wide, so allow a larger max dimension).
    const compressed = await compressImage(file, { maxDim: 1600 });
    const formData = new FormData();
    formData.append("file", compressed);
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
