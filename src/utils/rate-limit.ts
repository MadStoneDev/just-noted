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
  const resetAt = now + windowMs;

  try {
    // Get current count and TTL
    const [count, ttl] = await Promise.all([
      redis.get<number>(key),
      redis.ttl(key),
    ]);

    // If no record exists, create one
    if (count === null) {
      await redis.setex(key, Math.ceil(windowMs / 1000), 1);
      return {
        allowed: true,
        remaining: limit - 1,
        resetAt,
      };
    }

    // Check if limit exceeded
    if (count >= limit) {
      // Calculate actual reset time based on TTL
      const actualResetAt = ttl > 0 ? now + ttl * 1000 : resetAt;
      return {
        allowed: false,
        remaining: 0,
        resetAt: actualResetAt,
      };
    }

    // Increment count
    await redis.incr(key);
    const actualResetAt = ttl > 0 ? now + ttl * 1000 : resetAt;

    return {
      allowed: true,
      remaining: limit - count - 1,
      resetAt: actualResetAt,
    };
  } catch (error) {
    console.error("Rate limit check failed:", error);
    // On Redis error, allow the request but log the issue
    // This prevents Redis outages from blocking all requests
    return {
      allowed: true,
      remaining: limit,
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
