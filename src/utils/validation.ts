import { VALID_GOAL_TYPES, type GoalType } from "@/constants/app";

// ===========================
// CONSTANTS
// ===========================

export const VALIDATION_LIMITS = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 30,
  NOTE_TITLE_MAX: 500,
  NOTE_CONTENT_MAX: 1000000, // 1MB of text
  NOTEBOOK_NAME_MAX: 100,
  SHORTCODE_LENGTH: 9,
} as const;

// ===========================
// BASIC VALIDATORS
// ===========================

/**
 * Validates and returns a safe goal type value
 */
export function validateGoalType(type: unknown): GoalType {
  if (typeof type === "string" && VALID_GOAL_TYPES.includes(type as any)) {
    return type as GoalType;
  }
  return "";
}

/**
 * Validates user ID is not empty
 * @throws Error if userId is invalid
 */
export function validateUserId(userId: string): void {
  if (!userId?.trim()) {
    throw new Error("Invalid user ID: User ID cannot be empty");
  }
}

/**
 * Validates note title is not empty
 */
export function validateNoteTitle(title: string): boolean {
  return Boolean(title?.trim());
}

/**
 * Validates note content is a string
 */
export function validateNoteContent(content: unknown): content is string {
  return typeof content === "string";
}

/**
 * Validates note ID is not empty
 */
export function validateNoteId(noteId: string): boolean {
  return Boolean(noteId?.trim());
}

// ===========================
// ENHANCED VALIDATORS
// ===========================

/**
 * Validates a UUID format
 */
export function isValidUUID(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Validates username format (server-side)
 * - 3-30 characters
 * - Only alphanumeric and underscores
 * - Cannot start or end with underscore
 */
export function validateUsername(username: unknown): { valid: boolean; error?: string } {
  if (typeof username !== "string") {
    return { valid: false, error: "Username must be a string" };
  }

  const trimmed = username.trim();

  if (trimmed.length < VALIDATION_LIMITS.USERNAME_MIN) {
    return { valid: false, error: `Username must be at least ${VALIDATION_LIMITS.USERNAME_MIN} characters` };
  }

  if (trimmed.length > VALIDATION_LIMITS.USERNAME_MAX) {
    return { valid: false, error: `Username must be at most ${VALIDATION_LIMITS.USERNAME_MAX} characters` };
  }

  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    return { valid: false, error: "Username can only contain letters, numbers, and underscores" };
  }

  if (trimmed.startsWith("_") || trimmed.endsWith("_")) {
    return { valid: false, error: "Username cannot start or end with an underscore" };
  }

  return { valid: true };
}

/**
 * Validates note content length
 */
export function validateNoteContentLength(content: unknown): { valid: boolean; error?: string } {
  if (typeof content !== "string") {
    return { valid: false, error: "Content must be a string" };
  }

  if (content.length > VALIDATION_LIMITS.NOTE_CONTENT_MAX) {
    return { valid: false, error: `Note content exceeds maximum length of ${VALIDATION_LIMITS.NOTE_CONTENT_MAX} characters` };
  }

  return { valid: true };
}

/**
 * Validates note title length
 */
export function validateNoteTitleLength(title: unknown): { valid: boolean; error?: string } {
  if (typeof title !== "string") {
    return { valid: false, error: "Title must be a string" };
  }

  if (title.length > VALIDATION_LIMITS.NOTE_TITLE_MAX) {
    return { valid: false, error: `Title exceeds maximum length of ${VALIDATION_LIMITS.NOTE_TITLE_MAX} characters` };
  }

  return { valid: true };
}

/**
 * Validates notebook name
 */
export function validateNotebookName(name: unknown): { valid: boolean; error?: string } {
  if (typeof name !== "string") {
    return { valid: false, error: "Notebook name must be a string" };
  }

  const trimmed = name.trim();

  if (!trimmed) {
    return { valid: false, error: "Notebook name is required" };
  }

  if (trimmed.length > VALIDATION_LIMITS.NOTEBOOK_NAME_MAX) {
    return { valid: false, error: `Notebook name exceeds maximum length of ${VALIDATION_LIMITS.NOTEBOOK_NAME_MAX} characters` };
  }

  return { valid: true };
}

/**
 * Sanitizes a string by removing potentially dangerous characters
 * Used for display purposes, not for HTML content
 */
export function sanitizeString(input: string, maxLength?: number): string {
  if (typeof input !== "string") return "";

  let sanitized = input
    .replace(/[\x00-\x1F\x7F]/g, "") // Remove control characters
    .trim();

  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

/**
 * Validates an email format (basic check)
 */
export function isValidEmail(email: unknown): boolean {
  if (typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates that a number is within a range
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return typeof value === "number" && !isNaN(value) && value >= min && value <= max;
}
