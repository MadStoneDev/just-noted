import "server-only";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 (S3-compatible) storage helper. Server-only — R2 credentials
 * must never reach the browser, so all uploads go through server actions.
 *
 * Required env:
 *   R2_ACCOUNT_ID          - Cloudflare account id
 *   R2_ACCESS_KEY_ID       - R2 API token access key
 *   R2_SECRET_ACCESS_KEY   - R2 API token secret
 *   R2_BUCKET              - bucket name
 *   R2_PUBLIC_URL          - public base URL for the bucket
 *                            (r2.dev URL or a custom domain, no trailing slash)
 */
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;
const publicBase = process.env.R2_PUBLIC_URL;

let _client: S3Client | null = null;

function client(): S3Client {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "R2 storage is not configured (need R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET).",
    );
  }
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _client;
}

/** True only when every R2 var (including the public base URL) is present. */
export function isR2Configured(): boolean {
  return !!(accountId && accessKeyId && secretAccessKey && bucket && publicBase);
}

/** Public URL for an object key (no cache-busting; callers append ?v= if needed). */
export function r2PublicUrl(key: string): string {
  const base = (publicBase || "").replace(/\/+$/, "");
  return `${base}/${key}`;
}

/** Upload bytes to R2 under `key`; returns the public URL. */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket!,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Deterministic keys + a ?v= query on the stored URL handle cache-busting.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return r2PublicUrl(key);
}

/** Best-effort delete; never throws (caller shouldn't fail on cleanup). */
export async function deleteFromR2(key: string): Promise<void> {
  try {
    await client().send(new DeleteObjectCommand({ Bucket: bucket!, Key: key }));
  } catch (e) {
    console.error("R2 delete failed:", e);
  }
}
