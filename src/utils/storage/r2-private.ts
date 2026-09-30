import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * PRIVATE Cloudflare R2 bucket — public access disabled. Objects are never
 * served by a public URL; access is only via short-lived presigned GET URLs
 * issued by the server AFTER verifying the caller may access them. Used for chat
 * media (CHAT_PREFIX) and account exports (EXPORTS_PREFIX), kept entirely
 * separate from the public avatars/covers config in ./r2.ts.
 *
 * Env:
 *   R2_PRIVATE_BUCKET              - the private bucket name
 *   R2_PRIVATE_ACCESS_KEY_ID       - API token access key scoped to this bucket
 *   R2_PRIVATE_SECRET_ACCESS_KEY   - its secret
 *   R2_PRIVATE_ENDPOINT            - optional; when unset it's derived from
 *                                    R2_ACCOUNT_ID (same account). Set it only
 *                                    for a different account or a jurisdiction
 *                                    endpoint (e.g. an EU …eu.r2… host).
 */
const accountId = process.env.R2_ACCOUNT_ID;
const bucket = process.env.R2_PRIVATE_BUCKET;
const accessKeyId = process.env.R2_PRIVATE_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_PRIVATE_SECRET_ACCESS_KEY;
const endpoint =
  process.env.R2_PRIVATE_ENDPOINT ||
  (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

// Prefixes partition the two uses within the one private bucket.
export const CHAT_PREFIX = "chat/";
export const EXPORTS_PREFIX = "exports/";

// Presigned-GET lifetime. Short (5–15 min range) so a leaked URL expires fast;
// the client refreshes before it lapses so long-open chats don't break.
export const PRESIGN_TTL_SECONDS = 600; // 10 minutes

let _client: S3Client | null = null;
function client(): S3Client {
  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error(
      "Private R2 is not configured (need R2_PRIVATE_BUCKET, R2_PRIVATE_ACCESS_KEY_ID, R2_PRIVATE_SECRET_ACCESS_KEY, and R2_PRIVATE_ENDPOINT or R2_ACCOUNT_ID).",
    );
  }
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _client;
}

export function isPrivateR2Configured(): boolean {
  return !!(bucket && accessKeyId && secretAccessKey && endpoint);
}

/** Upload bytes to the private bucket under `key`. Never public. */
export async function putPrivateObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket!,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "private, max-age=0",
    }),
  );
}

/**
 * A short-lived presigned GET URL for `key`. The CALLER must have already
 * verified the requester may access this object — this only signs the URL.
 */
export async function presignGet(
  key: string,
  ttlSeconds: number = PRESIGN_TTL_SECONDS,
): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket!, Key: key }),
    { expiresIn: ttlSeconds },
  );
}

/** Best-effort delete; never throws (cleanup must not fail the caller). */
export async function deletePrivateObject(key: string): Promise<void> {
  try {
    await client().send(new DeleteObjectCommand({ Bucket: bucket!, Key: key }));
  } catch (e) {
    console.error("Private R2 delete failed:", e);
  }
}
