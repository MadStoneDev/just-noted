﻿"use server";

import redis from "@/utils/redis";

// Redis key for the global note counter
const GLOBAL_NOTE_COUNTER_KEY = "global:note:counter";

// Function to get the current note count
export async function getGlobalNoteCount() {
  try {
    const count = await redis.get(GLOBAL_NOTE_COUNTER_KEY);

    if (count === null) {
      await redis.set(GLOBAL_NOTE_COUNTER_KEY, 0);
      return 0;
    }

    // Make sure we handle the type properly for parseInt
    return typeof count === "string"
      ? parseInt(count, 10)
      : typeof count === "number"
        ? count
        : 0;
  } catch (error) {
    console.error("Failed to get global note count:", error);
    return 0; // Default to 0 if there's an error
  }
}

export async function incrementGlobalNoteCount() {
  try {
    return await redis.incr(GLOBAL_NOTE_COUNTER_KEY);
  } catch (error) {
    console.error("Failed to increment global note count:", error);

    // Fallback: get the current count and add 1
    try {
      const currentCount = await getGlobalNoteCount();
      const newCount = currentCount + 1;

      await redis.set(GLOBAL_NOTE_COUNTER_KEY, newCount);

      return newCount;
    } catch (fallbackError) {
      console.error("Failed fallback for increment:", fallbackError);
      return 0;
    }
  }
}
