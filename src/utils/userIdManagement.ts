import redis from "@/utils/redis";

// Keys for Redis
const USER_ACTIVITY_PREFIX = "user:activity:";

// TTL for user activity (2 months in seconds)
const TWO_MONTHS_SECONDS = 2 * 30 * 24 * 60 * 60;

/**
 * Register a user ID and set/refresh its activity timestamp with a 2-month TTL
 */
export async function registerUserId(userId: string): Promise<boolean> {
  try {
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
 * Refresh the activity timestamp for a user ID
 * This will extend the TTL for another 2 months
 */
export async function refreshUserActivity(userId: string): Promise<boolean> {
  try {
    // Set the current timestamp as the activity value with a 2-month TTL
    const now = Date.now();
    await redis.setex(
      `${USER_ACTIVITY_PREFIX}${userId}`,
      TWO_MONTHS_SECONDS,
      now.toString(),
    );

    return true;
  } catch (error) {
    console.error("Failed to refresh user activity:", error);
    return false;
  }
}

/**
 * Check if a user ID is active (has an activity record that hasn't expired)
 */
export async function isUserIdActive(userId: string): Promise<boolean> {
  try {
    const exists = await redis.exists(`${USER_ACTIVITY_PREFIX}${userId}`);
    return Boolean(exists);
  } catch (error) {
    console.error("Failed to check user ID:", error);
    return true;
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
    cursor = parseInt(newCursor, 10);

    if (Array.isArray(keys)) {
      allKeys.push(...keys);
    }
  } while (cursor !== 0);

  return allKeys;
}
