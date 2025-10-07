// src/scripts/backfillUserActivity.ts
import redis from "@/utils/redis";
import {
  NOTES_KEY_PREFIX,
  TWO_MONTHS_IN_SECONDS,
  USER_ACTIVITY_PREFIX,
} from "@/constants/app";

export async function scanAllKeys(
  pattern: string,
  startAt: number = 0,
  getTheFirst: number = 500,
): Promise<string[]> {
  let cursor = 0;
  const allKeys: string[] = [];

  do {
    const [newCursor, keys] = await redis.scan(cursor, {
      match: pattern,
      count: 5000,
    });

    cursor =
      typeof newCursor === "string" ? parseInt(newCursor, 10) : newCursor;

    // Add the keys to our collection
    if (Array.isArray(keys)) {
      allKeys.push(...keys);
    }
  } while (cursor !== 0);

  return allKeys;
}

export async function backfillUserActivity() {
  const noteKeys = await scanAllKeys(`${NOTES_KEY_PREFIX}*`);
  const now = Date.now().toString();

  for (const noteKey of noteKeys) {
    const userId = noteKey.substring(6); // Remove "notes:" prefix

    // Check if notes exist for this user
    const notes = await redis.get(noteKey);
    if (notes && Array.isArray(notes) && notes.length > 0) {
      // Set activity timestamp for existing user
      await redis.setex(
        `${USER_ACTIVITY_PREFIX}${userId}`,
        TWO_MONTHS_IN_SECONDS,
        now,
      );
      console.log(`Backfilled activity for user: ${userId}`);
    }
  }

  console.log(`Backfill complete. Processed ${noteKeys.length} users.`);
}
