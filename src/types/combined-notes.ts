import { Tables } from "../../database.types";

export type NoteSource = "redis" | "supabase";

// Unified note interface for the application
export interface CombinedNote {
  id: string;
  author: string;
  title: string;
  content: string;
  isPinned: boolean;
  isPrivate: boolean;
  isCollapsed: boolean;
  order: number;
  createdAt: number; // Always stored as timestamp for consistency
  updatedAt: number; // Always stored as timestamp for consistency
  goal?: number;
  goal_type?: "words" | "characters" | "";
  source: NoteSource;
}

// Redis note format (matches your current Redis structure)
export interface RedisNote {
  id: string;
  author?: string;
  title: string;
  content: string;
  pinned?: boolean;
  isPrivate?: boolean;
  isCollapsed?: boolean;
  order?: number;
  createdAt?: number;
  updatedAt?: number;
  goal?: number;
  goal_type?: "words" | "characters" | "";
}

// Supabase note type (from your database)
export type SupabaseNote = Tables<"notes">;

// Create note input interface
export interface CreateNoteInput {
  id: string;
  title: string;
  content: string;
  goal?: number;
  goal_type?: "words" | "characters" | "";
  pinned?: boolean;
  isPrivate?: boolean;
  isCollapsed?: boolean;
  order?: number;
}

// Convert RedisNote to CombinedNote
export function redisToCombi(note: RedisNote): CombinedNote {
  const now = Date.now();
  return {
    id: note.id,
    author: note.author || "",
    title: note.title || "",
    content: note.content || "",
    isPinned: note.pinned ?? false,
    isPrivate: note.isPrivate ?? false,
    isCollapsed: note.isCollapsed ?? false,
    order: note.order ?? 0,
    createdAt: note.createdAt ?? now,
    updatedAt: note.updatedAt ?? now,
    goal: note.goal || 0,
    goal_type: note.goal_type || "",
    source: "redis",
  };
}

// Convert CombinedNote to RedisNote
export function combiToRedis(note: CombinedNote): RedisNote {
  return {
    id: note.id,
    author: note.author,
    title: note.title,
    content: note.content,
    pinned: note.isPinned,
    isPrivate: note.isPrivate,
    isCollapsed: note.isCollapsed,
    order: note.order,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    goal: note.goal,
    goal_type: note.goal_type,
  };
}

// Convert SupabaseNote to CombinedNote
export function supabaseToCombi(note: SupabaseNote): CombinedNote {
  const now = Date.now();

  // Validate goal_type from database
  const validGoalTypes = ["words", "characters", ""];
  const goalType = validGoalTypes.includes(note.goal_type as any)
    ? (note.goal_type as "words" | "characters" | "")
    : "";

  return {
    id: note.id,
    author: note.author || "",
    title: note.title || "",
    content: note.content || "",
    isPinned: note.is_pinned ?? false,
    isPrivate: note.is_private ?? false,
    isCollapsed: note.is_collapsed ?? false,
    order: note.order ?? 0,
    createdAt: note.created_at ? new Date(note.created_at).getTime() : now,
    updatedAt: note.updated_at ? new Date(note.updated_at).getTime() : now,
    goal: note.goal || 0,
    goal_type: goalType,
    source: "supabase",
  };
}

// Convert CombinedNote to SupabaseNote format (for inserts/updates)
export function combiToSupabase(note: CombinedNote): Partial<SupabaseNote> {
  return {
    id: note.id,
    author: note.author,
    title: note.title,
    content: note.content,
    is_pinned: note.isPinned,
    is_private: note.isPrivate,
    is_collapsed: note.isCollapsed,
    order: note.order,
    goal: note.goal,
    goal_type: note.goal_type,
    created_at: new Date(note.createdAt).toISOString(),
    updated_at: new Date(note.updatedAt).toISOString(),
  };
}

// Convert CreateNoteInput to CombinedNote
export function createNote(
  input: CreateNoteInput,
  source: NoteSource = "redis",
): CombinedNote {
  const now = Date.now();
  return {
    id: input.id,
    author: "",
    title: input.title,
    content: input.content,
    isPinned: input.pinned ?? false,
    isPrivate: input.isPrivate ?? false,
    isCollapsed: input.isCollapsed ?? false,
    order: input.order ?? 0,
    createdAt: now,
    updatedAt: now,
    goal: input.goal || 0,
    goal_type: input.goal_type || "",
    source,
  };
}

// Safe content extraction - ensures content is never lost
export function safeExtractContent(note: any): string {
  // Try multiple possible content fields
  const content = note?.content || note?.Content || note?.CONTENT || "";

  // Ensure it's a string
  if (typeof content === "string") {
    return content;
  }

  // If it's not a string, try to convert it
  if (content !== null && content !== undefined) {
    return String(content);
  }

  return "";
}

// Safe conversion with content preservation
export function safeConvertNote(
  sourceNote: any,
  targetSource: NoteSource,
): CombinedNote {
  const now = Date.now();

  // Extract content safely
  const content = safeExtractContent(sourceNote);

  // Create base note structure
  const baseNote: CombinedNote = {
    id: sourceNote.id || "",
    author: sourceNote.author || "",
    title: sourceNote.title || "",
    content,
    isPinned:
      sourceNote.isPinned ?? sourceNote.pinned ?? sourceNote.is_pinned ?? false,
    isPrivate: sourceNote.isPrivate ?? sourceNote.is_private ?? false,
    isCollapsed: sourceNote.isCollapsed ?? sourceNote.is_collapsed ?? false,
    order: sourceNote.order ?? 0,
    createdAt: now,
    updatedAt: now,
    goal: sourceNote.goal || 0,
    goal_type: sourceNote.goal_type || "",
    source: targetSource,
  };

  // Handle timestamps based on source format
  if (sourceNote.createdAt && typeof sourceNote.createdAt === "number") {
    baseNote.createdAt = sourceNote.createdAt;
  } else if (
    sourceNote.created_at &&
    typeof sourceNote.created_at === "string"
  ) {
    baseNote.createdAt = new Date(sourceNote.created_at).getTime();
  }

  if (sourceNote.updatedAt && typeof sourceNote.updatedAt === "number") {
    baseNote.updatedAt = sourceNote.updatedAt;
  } else if (
    sourceNote.updated_at &&
    typeof sourceNote.updated_at === "string"
  ) {
    baseNote.updatedAt = new Date(sourceNote.updated_at).getTime();
  }

  return baseNote;
}

// Deep clone a note to prevent reference issues
export function cloneNote(note: CombinedNote): CombinedNote {
  return {
    ...note,
    content: note.content, // Explicitly preserve content
  };
}

// Validate that conversion preserved content
export function validateContentPreservation(
  original: any,
  converted: CombinedNote,
): boolean {
  const originalContent = safeExtractContent(original);
  return originalContent === converted.content;
}

/**
 * Generate a unique note ID that doesn't conflict with existing IDs
 */
export function generateNoteId(existingIds: string[]): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  let newId = `note_${timestamp}_${random}`;

  // Ensure uniqueness
  let counter = 0;
  while (existingIds.includes(newId)) {
    counter++;
    newId = `note_${timestamp}_${random}_${counter}`;
  }

  return newId;
}
