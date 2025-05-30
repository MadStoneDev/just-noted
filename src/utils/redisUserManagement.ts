import redis from "@/utils/redis";

// Redis Keys
const NOTES_PREFIX = "notes:";
const USER_ACTIVITY_PREFIX = "user:activity:";

// Constants
const TWO_MONTHS_IN_SECONDS = 2 * 30 * 24 * 60 * 60;

// When user visits, refresh the TTL
export const refreshUserNotes = async (userId: string) => {
  const notesKey = `notes:${userId}`;
  const exists = await redis.exists(notesKey);

  if (exists) {
    await redis.expire(notesKey, TWO_MONTHS_IN_SECONDS);
    return true;
  }
  return false;
};

// Get all active users (those with notes)
export const getAllActiveUserIds = async () => {
  const keys = await scanAllKeys("notes:*");
  return keys.map((key) => key.substring("notes:".length));
};

// Scan All Keys
export const scanAllKeys = async (pattern: string) => {
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
};
