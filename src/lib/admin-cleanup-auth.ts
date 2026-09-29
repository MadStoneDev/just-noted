import crypto from "crypto";

/** Timing-safe comparison of API keys to prevent timing attacks. */
export function verifyApiKey(provided: string, expected: string): boolean {
  try {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length) {
      // Still compare (constant time) even on a length mismatch.
      crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
      return false;
    }
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/** True when the request carries the correct x-api-key for admin cleanup jobs. */
export function isAuthorizedCleanupRequest(request: Request): boolean {
  const apiKey = request.headers.get("x-api-key");
  const expected = process.env.CLEANUP_API_KEY;
  return !!(apiKey && expected && verifyApiKey(apiKey, expected));
}
