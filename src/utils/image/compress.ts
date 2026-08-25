/**
 * Client-side image downscale + compression, run before uploading so we never
 * post a huge original through a server action (which has a body-size limit).
 *
 * Returns a new File (WebP by default). Falls back to the original file for
 * non-images, GIFs (to preserve animation), or if anything goes wrong.
 */
export async function compressImage(
  file: File,
  opts: { maxDim: number; quality?: number; mimeType?: string },
): Promise<File> {
  const { maxDim, quality = 0.85, mimeType = "image/webp" } = opts;

  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif") return file; // keep animation

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, mimeType, quality),
    );
    if (!blob) return file;

    // Don't bother if compression didn't actually shrink it.
    if (blob.size >= file.size) return file;

    const ext = mimeType === "image/webp" ? "webp" : mimeType === "image/png" ? "png" : "jpg";
    const name = file.name.replace(/\.\w+$/, "") + "." + ext;
    return new File([blob], name, { type: mimeType });
  } catch (e) {
    console.error("Image compression failed, using original:", e);
    return file;
  }
}
