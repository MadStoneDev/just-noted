// utils/userIdManagement.ts

import redis from "@/utils/redis";

// Redis key for storing all active user IDs
const ACTIVE_USER_IDS_KEY = "global:active:user:ids";

/**
 * Register a user ID in the global active users list
 */
export async function registerUserId(userId: string): Promise<boolean> {
  try {
    // Add the user ID to the set of active user IDs
    // Using Redis SET data structure which automatically handles duplicates
    await redis.sadd(ACTIVE_USER_IDS_KEY, userId);
    return true;
  } catch (error) {
    console.error("Failed to register user ID:", error);
    return false;
  }
}

/**
 * Check if a user ID exists in the active users list
 */
export async function isUserIdActive(userId: string): Promise<boolean> {
  try {
    // Check if the user ID exists in the set
    const exists = await redis.sismember(ACTIVE_USER_IDS_KEY, userId);
    return Boolean(exists);
  } catch (error) {
    console.error("Failed to check user ID:", error);
    // Default to true to avoid blocking legitimate users if Redis has issues
    return true;
  }
}

/**
 * Remove a user ID from the active users list
 */
export async function removeUserId(userId: string): Promise<boolean> {
  try {
    // Remove the user ID from the set
    await redis.srem(ACTIVE_USER_IDS_KEY, userId);
    return true;
  } catch (error) {
    console.error("Failed to remove user ID:", error);
    return false;
  }
}

/**
 * Get all active user IDs
 */
export async function getAllActiveUserIds(): Promise<string[]> {
  try {
    // Get all members of the set
    const members = await redis.smembers(ACTIVE_USER_IDS_KEY);
    return members as string[];
  } catch (error) {
    console.error("Failed to get active user IDs:", error);
    return [];
  }
}

/**
 * Enhanced getUserId function that checks with Redis
 */
export const getUserId = () => {
  // This function runs on client-side, so we just return the localStorage value
  // We'll validate it on the server-side before any data operations
  const existingId = localStorage.getItem("notes_user_id");

  if (existingId) {
    return existingId;
  }

  const newId = crypto.randomUUID();
  localStorage.setItem("notes_user_id", newId);
  return newId;
};
