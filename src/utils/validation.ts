import { VALID_GOAL_TYPES, type GoalType } from "@/constants/app";

/**
 * Validates and returns a safe goal type value
 * @param type - The goal type to validate
 * @returns A valid GoalType or empty string as fallback
 */
export function validateGoalType(type: unknown): GoalType {
  if (typeof type === "string" && VALID_GOAL_TYPES.includes(type as any)) {
    return type as GoalType;
  }
  return "";
}

/**
 * Validates user ID is not empty
 * @param userId - The user ID to validate
 * @throws Error if userId is invalid
 */
export function validateUserId(userId: string): void {
  if (!userId?.trim()) {
    throw new Error("Invalid user ID: User ID cannot be empty");
  }
}

/**
 * Validates note title is not empty
 * @param title - The title to validate
 * @returns true if valid, false otherwise
 */
export function validateNoteTitle(title: string): boolean {
  return Boolean(title?.trim());
}

/**
 * Validates note content is a string
 * @param content - The content to validate
 * @returns true if valid, false otherwise
 */
export function validateNoteContent(content: unknown): content is string {
  return typeof content === "string";
}

/**
 * Validates note ID is not empty
 * @param noteId - The note ID to validate
 * @returns true if valid, false otherwise
 */
export function validateNoteId(noteId: string): boolean {
  return Boolean(noteId?.trim());
}
