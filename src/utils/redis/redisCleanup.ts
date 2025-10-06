import redis from "@/utils/redis";

/**
 * Runs a cleanup operation to remove notes for users who have been inactive
 * for more than 2 months (TTL has expired on their activity key)
 */
export async function cleanupOldNotes() {
  try {
    // Get all user note keys from Redis
    const userNoteKeys = await scanAllKeys("notes:*");

    // Get all active user IDs (these have valid activity timestamps)
    const activeUserIds = await scanAllKeys("user:activity:*");
    const activeUserIdSet = new Set(activeUserIds);

    // Track statistics for reporting
    let totalUsersRemoved = 0;
    let totalUsersProcessed = userNoteKeys.length;
    const removedUserIds: string[] = [];

    // Process each user's notes
    for (const noteKey of userNoteKeys) {
      const userId = noteKey.substring(6); // "notes:".length = 6

      // If user is not in the active set, delete their notes
      if (!activeUserIdSet.has(userId)) {
        await redis.del(noteKey);
        removedUserIds.push(userId);
        totalUsersRemoved++;
      }
    }

    console.log(
      `Cleanup completed: Removed notes for ${totalUsersRemoved} inactive users out of ${totalUsersProcessed} total users`,
    );

    return {
      success: true,
      stats: {
        totalUsersProcessed,
        totalUsersRemoved,
        removedUserIds,
      },
    };
  } catch (error) {
    console.error("Redis cleanup failed:", error);
    return {
      success: false,
      error: String(error),
    };
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
