import { redis } from "@/lib/redis";

const RATE_LIMIT_PREFIX = "ratelimit:";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface RateLimitOptions {
  /**
   * What to do when Valkey is unreachable. Default: allow (fail open) — a cache
   * outage must not break the app. Pass `true` only where an unlimited burst
   * costs real money (paid AI calls, account exports); those then refuse fast
   * (~1.5s, bounded by the client's command timeout) instead of hanging.
   */
  failClosed?: boolean;
}

/**
 * Fixed-window rate limiter: one atomic MULTI of INCR + EXPIRE NX + PTTL.
 * EXPIRE NX sets the window's TTL on the first hit only, and because it runs in
 * the same transaction as the INCR a key can never be left without a TTL.
 */
export async function checkRateLimit(
  userId: string,
  feature: string,
  limit: number,
  windowMs: number,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const key = `${RATE_LIMIT_PREFIX}${feature}:${userId}`;
  const now = Date.now();
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    const results = await redis.multi().incr(key).expire(key, windowSec, "NX").pttl(key).exec();
    // exec() resolves to [err, result] tuples (or null if the transaction was aborted).
    if (!results) throw new Error("rate limit transaction aborted");
    for (const [err] of results) if (err) throw err;
    const count = Number(results[0][1]);
    const pttl = Number(results[2][1]);
    const resetAt = pttl > 0 ? now + pttl : now + windowMs;

    if (count > limit) return { allowed: false, remaining: 0, resetAt };
    return { allowed: true, remaining: Math.max(0, limit - count), resetAt };
  } catch (error) {
    console.error(`Rate limit check failed (${feature}), failing ${options.failClosed ? "closed" : "open"}:`, error);
    return options.failClosed
      ? { allowed: false, remaining: 0, resetAt: now + windowMs }
      : { allowed: true, remaining: limit, resetAt: now + windowMs };
  }
}

/**
 * Get current rate limit status without incrementing. Display-only, so it
 * always fails open.
 */
export async function getRateLimitStatus(
  userId: string,
  feature: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const key = `${RATE_LIMIT_PREFIX}${feature}:${userId}`;
  const now = Date.now();
  const resetAt = now + windowMs;

  try {
    const results = await redis.pipeline().get(key).pttl(key).exec();
    if (!results) throw new Error("pipeline returned no results");
    for (const [err] of results) if (err) throw err;
    const raw = results[0][1] as string | null;
    const pttl = Number(results[1][1]);

    if (raw === null) return { allowed: true, remaining: limit, resetAt };

    const count = Number(raw);
    return {
      allowed: count < limit,
      remaining: Math.max(0, limit - count),
      resetAt: pttl > 0 ? now + pttl : resetAt,
    };
  } catch (error) {
    console.error("Rate limit status check failed:", error);
    return { allowed: true, remaining: limit, resetAt };
  }
}
