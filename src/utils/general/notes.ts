import { v4 as uuidv4 } from "uuid";

/**
 * Generates a unique note ID that doesn't conflict with existing IDs
 * @param existingIds - Array of existing note IDs to check against
 * @returns A unique UUID v4 string
 */
export const generateNoteId = (existingIds: string[]): string => {
  const existingUuidSet = new Set(existingIds);

  // In practice, UUID collisions are astronomically rare
  // But we check anyway for safety
  let uuid = uuidv4();
  let attempts = 0;
  const MAX_ATTEMPTS = 10;

  while (existingUuidSet.has(uuid) && attempts < MAX_ATTEMPTS) {
    uuid = uuidv4();
    attempts++;
  }

  if (attempts === MAX_ATTEMPTS) {
    console.warn("Multiple UUID collisions detected - this is extremely rare");
  }

  return uuid;
};

/**
 * Gets or creates a user ID for anonymous note storage
 * Stored in localStorage for persistence across sessions
 * @returns The user's unique ID
 */
export const getUserId = (): string => {
  const existingId = localStorage.getItem("notes_user_id");

  if (existingId) {
    return existingId;
  }

  const newId = uuidv4();
  localStorage.setItem("notes_user_id", newId);
  return newId;
};
