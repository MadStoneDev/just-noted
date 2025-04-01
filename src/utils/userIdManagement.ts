import redis from "@/utils/redis";

// Keys for Redis
const ACTIVE_USER_IDS_KEY = "global:active:user:ids"; // Keep this for backwards compatibility
const USER_ACTIVITY_PREFIX = "user:activity:"; // New prefix for activity timestamps

// TTL for user activity (2 months in seconds)
const TWO_MONTHS_SECONDS = 2 * 30 * 24 * 60 * 60; // 2 months in seconds

/**
 * Register a user ID and set/refresh its activity timestamp with a 2-month TTL
 */
export async function registerUserId(userId: string): Promise<boolean> {
  try {
    // Add to the set (keep for backwards compatibility)
    await redis.sadd(ACTIVE_USER_IDS_KEY, userId);

    // Set the current timestamp as the activity value with a 2-month TTL
    const now = Date.now();
    await redis.setex(
      `${USER_ACTIVITY_PREFIX}${userId}`,
      TWO_MONTHS_SECONDS,
      now.toString(),
    );

    return true;
  } catch (error) {
    console.error("Failed to register user ID:", error);
    return false;
  }
}

/**
 * Check if a user ID is active (has an activity record that hasn't expired)
 */
export async function isUserIdActive(userId: string): Promise<boolean> {
  try {
    // Check if the user has an activity timestamp
    const exists = await redis.exists(`${USER_ACTIVITY_PREFIX}${userId}`);
    return Boolean(exists);
  } catch (error) {
    console.error("Failed to check user ID:", error);
    // Default to true to avoid blocking legitimate users if Redis has issues
    return true;
  }
}

/**
 * Remove a user ID from active tracking
 */
export async function removeUserId(userId: string): Promise<boolean> {
  try {
    // Remove from the set
    await redis.srem(ACTIVE_USER_IDS_KEY, userId);

    // Delete the activity timestamp
    await redis.del(`${USER_ACTIVITY_PREFIX}${userId}`);

    return true;
  } catch (error) {
    console.error("Failed to remove user ID:", error);
    return false;
  }
}

/**
 * Get the timestamp of the last activity for a user
 * Returns null if the user is not active
 */
export async function getUserLastActivity(
  userId: string,
): Promise<number | null> {
  try {
    const timestamp = await redis.get(`${USER_ACTIVITY_PREFIX}${userId}`);
    return timestamp ? parseInt(timestamp as string, 10) : null;
  } catch (error) {
    console.error("Failed to get user last activity:", error);
    return null;
  }
}

/**
 * Get all active user IDs
 */
export async function getAllActiveUserIds(): Promise<string[]> {
  try {
    // Use SCAN to find all keys with the activity prefix
    const keys = await scanAllKeys(`${USER_ACTIVITY_PREFIX}*`);

    // Extract user IDs from keys
    return keys.map((key) => key.substring(USER_ACTIVITY_PREFIX.length));
  } catch (error) {
    console.error("Failed to get active user IDs:", error);
    return [];
  }
}

async function scanAllKeys(pattern: string): Promise<string[]> {
  let cursor = 0;
  const allKeys: string[] = [];

  do {
    const [newCursor, keys] = await redis.scan(cursor, { match: pattern });

    cursor =
      typeof newCursor === "string" ? parseInt(newCursor, 10) : newCursor;

    // Add the keys to our collection
    if (Array.isArray(keys)) {
      allKeys.push(...keys);
    }
  } while (cursor !== 0);

  return allKeys;
}
