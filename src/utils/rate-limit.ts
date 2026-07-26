import redis from "@/utils/redis";

const RATE_LIMIT_PREFIX = "ratelimit:";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Redis-based rate limiter
 * Uses sliding window with atomic operations for accuracy across distributed instances
 */
export async function checkRateLimit(
  userId: string,
  feature: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const key = `${RATE_LIMIT_PREFIX}${feature}:${userId}`;
  const now = Date.now();
  const windowSec = Math.ceil(windowMs / 1000);
  const resetAt = now + windowMs;

  try {
    // Atomic increment: INCR returns the new value and never races the way a
    // separate GET+INCR would. Set the TTL only on the first hit of the window.
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSec);
    }

    const ttl = await redis.ttl(key);
    const actualResetAt = ttl > 0 ? now + ttl * 1000 : resetAt;

    if (count > limit) {
      return { allowed: false, remaining: 0, resetAt: actualResetAt };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - count),
      resetAt: actualResetAt,
    };
  } catch (error) {
    console.error("Rate limit check failed:", error);
    // Fail CLOSED: these limits guard expensive paid (AI) calls, so a Redis
    // outage must not become an unlimited-spend hole. Block rather than allow.
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }
}

/**
 * Get current rate limit status without incrementing
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
    const [count, ttl] = await Promise.all([
      redis.get<number>(key),
      redis.ttl(key),
    ]);

    if (count === null) {
      return {
        allowed: true,
        remaining: limit,
        resetAt,
      };
    }

    const actualResetAt = ttl > 0 ? now + ttl * 1000 : resetAt;

    return {
      allowed: count < limit,
      remaining: Math.max(0, limit - count),
      resetAt: actualResetAt,
    };
  } catch (error) {
    console.error("Rate limit status check failed:", error);
    return {
      allowed: true,
      remaining: limit,
      resetAt,
    };
  }
}
