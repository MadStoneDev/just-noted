"use server";

import redis from "@/utils/redis";
import { GLOBAL_NOTE_COUNTER_KEY } from "@/constants/app";

// Function to get the current note count
export async function getGlobalNoteCount(): Promise<number> {
  try {
    const count = await redis.get(GLOBAL_NOTE_COUNTER_KEY);

    if (count === null) {
      // Initialize counter if it doesn't exist
      await redis.set(GLOBAL_NOTE_COUNTER_KEY, 0);
      return 0;
    }

    // Handle both string and number types from Redis
    const parsedCount =
      typeof count === "string" ? parseInt(count, 10) : Number(count);

    // Validate the parsed count
    if (isNaN(parsedCount)) {
      console.warn("Invalid count value in Redis, resetting to 0");
      await redis.set(GLOBAL_NOTE_COUNTER_KEY, 0);
      return 0;
    }

    return parsedCount;
  } catch (error) {
    console.error("Failed to get global note count:", error);
    return 0;
  }
}

export async function incrementGlobalNoteCount(): Promise<number> {
  try {
    // Redis INCR is atomic and handles initialization automatically
    const newCount = await redis.incr(GLOBAL_NOTE_COUNTER_KEY);
    return newCount;
  } catch (error) {
    console.error("Failed to increment global note count:", error);

    // Fallback: try manual increment
    try {
      const currentCount = await getGlobalNoteCount();
      const newCount = currentCount + 1;

      // Use Redis transaction for atomic operation
      const transaction = redis.multi();
      transaction.set(GLOBAL_NOTE_COUNTER_KEY, newCount);
      const results = await transaction.exec();

      if (results && results[0]) {
        return newCount;
      } else {
        throw new Error("Transaction failed");
      }
    } catch (fallbackError) {
      console.error("Failed fallback for increment:", fallbackError);
      // Return a reasonable fallback value instead of 0
      return Date.now() % 1000000; // Use timestamp-based fallback
    }
  }
}
