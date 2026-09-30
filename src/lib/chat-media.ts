// Allowlist + validation for chat media (one attachment per message). Pure so
// the same rules apply on the upload request and the send, and are testable.

export type ChatMediaKind = "image" | "gif" | "audio";

interface MediaSpec {
  mimes: string[];
  maxBytes: number;
  ext: Record<string, string>;
}

const MB = 1024 * 1024;

const SPECS: Record<ChatMediaKind, MediaSpec> = {
  image: {
    mimes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 8 * MB,
    ext: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
  },
  gif: {
    mimes: ["image/gif"],
    maxBytes: 12 * MB,
    ext: { "image/gif": "gif" },
  },
  audio: {
    mimes: ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"],
    maxBytes: 16 * MB,
    ext: { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3" },
  },
};

/** The bare mime type, lowercased, without any `; codecs=…` suffix. */
export function baseMime(mime: string): string {
  return (mime || "").split(";")[0].trim().toLowerCase();
}

export type MediaValidation =
  | { ok: true; ext: string }
  | { ok: false; error: string };

/** Validate a kind/mime/size against the allowlist; returns the file extension. */
export function validateChatMedia(kind: string, mime: string, size: number): MediaValidation {
  const spec = SPECS[kind as ChatMediaKind];
  if (!spec) return { ok: false, error: "Unsupported media type" };
  const base = baseMime(mime);
  if (!spec.mimes.includes(base)) return { ok: false, error: "That file type isn’t supported" };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: "Empty file" };
  if (size > spec.maxBytes) {
    return { ok: false, error: `File is too large (max ${Math.round(spec.maxBytes / MB)}MB)` };
  }
  return { ok: true, ext: spec.ext[base] };
}
