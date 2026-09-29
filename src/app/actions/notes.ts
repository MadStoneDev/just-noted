"use server";

import redis from "@/utils/redis";
import {
  readAllNotes,
  putNote,
  putNotes,
  deleteNote as hdelNote,
  casUpdateNote,
  getNote,
} from "@/utils/redis/note-store";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
// Note: revalidatePath removed - client-side state is managed by Zustand
// Calling revalidatePath on every Redis operation caused unnecessary re-renders
import {
  RedisNote,
  CreateNoteInput,
  CombinedNote,
  combiToSupabase,
  supabaseToCombi,
} from "@/types/combined-notes";
import {
  validateUserId,
  validateGoalType,
  validateNoteContent,
  validateNoteTitle,
  validateNoteContentLength,
  validateNoteTitleLength,
  isValidUUID,
} from "@/utils/validation";
import {
  NOTES_KEY_PREFIX,
  MAX_RETRIES,
} from "@/constants/app";

// ===========================
// TYPES
// ===========================
type NoteOperationParams =
  | { operation: "create"; userId: string; note: CreateNoteInput | RedisNote }
  | {
      operation: "update";
      userId: string;
      noteId: string;
      content: string;
      goal?: number;
      goalType?: string;
      baseVersion?: number; // Phase 2: best-effort optimistic concurrency
    }
  | { operation: "updateTitle"; userId: string; noteId: string; title: string }
  | {
      operation: "updatePin";
      userId: string;
      noteId: string;
      isPinned: boolean;
    }
  | {
      operation: "updatePrivacy";
      userId: string;
      noteId: string;
      isPrivate: boolean;
    }
  | {
      operation: "updateCollapsed";
      userId: string;
      noteId: string;
      isCollapsed: boolean;
    }
  | { operation: "updateOrder"; userId: string; noteId: string; order: number }
  | { operation: "delete"; userId: string; noteId: string }
  | { operation: "getAll"; userId: string }
  | {
      operation: "batchUpdateOrders";
      userId: string;
      updates: { id: string; order: number }[];
    };

// ===========================
// UTILITY FUNCTIONS
// ===========================

/**
 * Validates Redis userId: must be non-empty AND valid UUID format.
 * Prevents key injection and limits attack surface to UUID guessing (2^122 entropy).
 * @throws Error if userId is invalid
 */
function validateRedisUserId(userId: string): void {
  validateUserId(userId);
  if (!isValidUUID(userId)) {
    throw new Error("Invalid user ID format: must be a valid UUID");
  }
}

async function isBotRequest(action: string): Promise<boolean> {
  try {
    const headersList = await headers();
    const isBotHeader = headersList?.get("x-is-bot");
    const isBot = isBotHeader === "true";
    if (isBot) console.log(`🤖 Bot detected, skipping ${action}`);
    return isBot;
  } catch {
    return false;
  }
}

// The legacy whole-array read/write helpers are gone: notes now live in a
// per-note hash (utils/redis/note-store). Crucially, nothing SETs a string over
// the key any more — writes only HSET/HDEL fields — so a partial migration can
// never be clobbered.

function createNoteInputToRedisNote(
  input: CreateNoteInput,
  userId: string,
): RedisNote {
  const now = Date.now();
  return {
    id: input.id,
    author: userId,
    title: input.title,
    content: input.content,
    pinned: input.pinned ?? false,
    isPrivate: input.isPrivate ?? false,
    isCollapsed: input.isCollapsed ?? false,
    order: input.order ?? 0,
    createdAt: now,
    updatedAt: now,
    goal: input.goal || 0,
    goal_type: validateGoalType(input.goal_type),
  };
}

// ===========================
// REDIS HELPER: Update Single Field
// ===========================

/**
 * Generic helper to update a single field in a Redis note
 * Eliminates code duplication across pin/privacy/collapsed/order updates
 */
async function updateRedisNoteField<K extends keyof RedisNote>(
  userId: string,
  noteId: string,
  field: K,
  value: RedisNote[K],
): Promise<{ success: boolean; error?: string }> {
  try {
    validateRedisUserId(userId);

    // Per-note read-modify-write on a single hash field — no other note is
    // touched, so metadata changes can't clobber a concurrent content save on a
    // different note. Bump version so reconcile/realtime see the change.
    const cur = await getNote(userId, noteId);
    if (!cur) return { success: false, error: "Note not found" };

    const updated: RedisNote = {
      ...cur,
      [field]: value,
      updatedAt: Date.now(),
      version: (cur.version ?? 1) + 1,
    };
    await putNote(userId, updated);

    return { success: true };
  } catch (error) {
    console.error(`Failed to update ${String(field)}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ===========================
// REDIS OPERATIONS
// ===========================
// LIMITATION (H9): All notes for a user are stored as a single JSON key in Redis.
// Every read-modify-write fetches ALL notes, modifies one, and writes ALL back.
// The proper fix is Redis hashes: HSET notes:{userId} {noteId} {json}
// This requires migrating to self-hosted Redis (Upstash REST API doesn't support HSET well).
async function handleRedisOperation(params: NoteOperationParams) {
  const { operation } = params;

  if (await isBotRequest(operation)) {
    return { success: true };
  }

  try {
    switch (operation) {
      case "create": {
        const { userId, note } = params;
        validateRedisUserId(userId);

        if (!note?.id?.trim()) {
          return {
            success: false,
            error: "Invalid note data: Note must have an ID",
          };
        }

        let newNote: RedisNote;
        if ("createdAt" in note && "updatedAt" in note) {
          newNote = note;
        } else {
          newNote = createNoteInputToRedisNote(note as CreateNoteInput, userId);
        }
        if (newNote.version == null) newNote.version = 1;

        await putNote(userId, newNote);
        return { success: true, notes: [newNote] };
      }

      case "update": {
        const { userId, noteId, content, goal = 0, goalType = "", baseVersion } = params;
        validateRedisUserId(userId);

        if (!validateNoteContent(content)) {
          return {
            success: false,
            error: "Invalid content: Content must be a string",
          };
        }

        // Validate content length
        const contentLengthValidation = validateNoteContentLength(content);
        if (!contentLengthValidation.valid) {
          return {
            success: false,
            error: contentLengthValidation.error || "Content too long",
          };
        }

        // Atomic per-note compare-and-set (Lua). Concurrent saves to different
        // notes never collide; a stale write preserves the existing content as a
        // conflicted-copy field in the same atomic step.
        const res = await casUpdateNote(
          userId,
          noteId,
          { content, goal: goal || 0, goalType: validateGoalType(goalType) },
          baseVersion,
        );
        if (!res.success) {
          const notFound = res.error === "not_found";
          return {
            success: false,
            error: notFound
              ? `Note ${noteId} not found. Please refresh and try again.`
              : res.error || "Update failed",
          };
        }
        return { success: true, version: res.version };
      }

      case "updateTitle": {
        const { userId, noteId, title } = params;

        if (!validateNoteTitle(title)) {
          return {
            success: false,
            error: "Invalid title: Title cannot be empty",
          };
        }

        return updateRedisNoteField(userId, noteId, "title", title.trim());
      }

      case "updatePin": {
        const { userId, noteId, isPinned } = params;
        return updateRedisNoteField(userId, noteId, "pinned", isPinned);
      }

      case "updatePrivacy": {
        const { userId, noteId, isPrivate } = params;
        return updateRedisNoteField(userId, noteId, "isPrivate", isPrivate);
      }

      case "updateCollapsed": {
        const { userId, noteId, isCollapsed } = params;
        return updateRedisNoteField(userId, noteId, "isCollapsed", isCollapsed);
      }

      case "updateOrder": {
        const { userId, noteId, order } = params;

        // Validate order is a valid number
        if (typeof order !== "number" || order < 0) {
          return {
            success: false,
            error: "Invalid order: Order must be a non-negative number",
          };
        }

        return updateRedisNoteField(userId, noteId, "order", order);
      }

      case "delete": {
        const { userId, noteId } = params;
        validateRedisUserId(userId);

        const removed = await hdelNote(userId, noteId);
        if (!removed) return { success: false, error: "Note not found" };
        return { success: true };
      }

      case "getAll": {
        const { userId } = params;
        validateRedisUserId(userId);
        const notes = await readAllNotes(userId);
        return { success: true, notes };
      }

      case "batchUpdateOrders": {
        const { userId, updates } = params;
        validateRedisUserId(userId);

        const invalidOrder = updates.find(
          (u) => typeof u.order !== "number" || u.order < 0,
        );
        if (invalidOrder) {
          return { success: false, error: "Invalid order value in batch update" };
        }

        const currentNotes = await readAllNotes(userId);
        const updateMap = new Map(updates.map((u) => [u.id, u.order]));
        const changed = currentNotes
          .filter((n) => updateMap.has(n.id))
          .map((n) => ({ ...n, order: updateMap.get(n.id)!, updatedAt: Date.now() }));

        await putNotes(userId, changed);
        return { success: true };
      }

      default:
        return { success: false, error: "Unknown operation" };
    }
  } catch (error) {
    console.error(`❌ Redis operation ${operation} failed:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to ${operation}: ${errorMessage}` };
  }
}

// ===========================
// SUPABASE OPERATIONS
// ===========================
async function handleSupabaseOperation(params: NoteOperationParams) {
  const { operation } = params;

  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user?.id) {
      return { success: false, error: "User not authenticated" };
    }

    const userId = authData.user.id;

    switch (operation) {
      case "create": {
        const { note } = params;
        const supabaseNote = combiToSupabase({
          ...note,
          author: userId,
          goal_type: validateGoalType((note as any).goal_type),
        } as CombinedNote);

        const { data, error } = await supabase
          .from("notes")
          .insert(supabaseNote)
          .select()
          .single();

        if (error) {
          return { success: false, error: `Database error: ${error.message}` };
        }

        return { success: true, note: supabaseToCombi(data) };
      }

      case "update": {
        const { noteId, content, goal = 0, goalType = "" } = params;

        // Validate content length
        const contentLengthValidation = validateNoteContentLength(content);
        if (!contentLengthValidation.valid) {
          return {
            success: false,
            error: contentLengthValidation.error || "Content too long",
          };
        }

        const { error } = await supabase
          .from("notes")
          .update({
            content,
            goal: goal || 0,
            goal_type: validateGoalType(goalType),
            updated_at: new Date().toISOString(),
          })
          .eq("id", noteId)
          .eq("author", userId);

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      }

      case "updateTitle": {
        const { noteId, title } = params;

        if (!validateNoteTitle(title)) {
          return {
            success: false,
            error: "Invalid title: Title cannot be empty",
          };
        }

        // Validate title length
        const titleLengthValidation = validateNoteTitleLength(title);
        if (!titleLengthValidation.valid) {
          return {
            success: false,
            error: titleLengthValidation.error || "Title too long",
          };
        }

        const { error } = await supabase
          .from("notes")
          .update({ title: title.trim(), updated_at: new Date().toISOString() })
          .eq("id", noteId)
          .eq("author", userId);

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      }

      case "updatePin": {
        const { noteId, isPinned } = params;

        const { error } = await supabase
          .from("notes")
          .update({ is_pinned: isPinned, updated_at: new Date().toISOString() })
          .eq("id", noteId)
          .eq("author", userId);

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      }

      case "updatePrivacy": {
        const { noteId, isPrivate } = params;

        const { error } = await supabase
          .from("notes")
          .update({
            is_private: isPrivate,
            updated_at: new Date().toISOString(),
          })
          .eq("id", noteId)
          .eq("author", userId);

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      }

      case "updateCollapsed": {
        const { noteId, isCollapsed } = params;

        const { error } = await supabase
          .from("notes")
          .update({
            is_collapsed: isCollapsed,
            updated_at: new Date().toISOString(),
          })
          .eq("id", noteId)
          .eq("author", userId);

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      }

      case "updateOrder": {
        const { noteId, order } = params;

        // Validate order
        if (typeof order !== "number" || order < 0) {
          return {
            success: false,
            error: "Invalid order: Order must be a non-negative number",
          };
        }

        const { error } = await supabase
          .from("notes")
          .update({ order, updated_at: new Date().toISOString() })
          .eq("id", noteId)
          .eq("author", userId);

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      }

      case "delete": {
        const { noteId } = params;

        // Soft delete → the note goes to Trash (restorable for a window) instead
        // of being destroyed. Permanent removal is a separate action
        // (permanentlyDeleteNote / Empty trash).
        const { error } = await supabase
          .from("notes")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", noteId)
          .eq("author", userId);

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      }

      case "getAll": {
        const { data, error } = await supabase
          .from("notes")
          .select("*")
          .eq("author", userId)
          .is("deleted_at", null)
          .order("is_pinned", { ascending: false })
          .order("order", { ascending: true })
          .order("created_at", { ascending: false });

        if (error) {
          return { success: false, error: error.message };
        }

        const notes = data.map(supabaseToCombi);
        return { success: true, notes };
      }

      case "batchUpdateOrders": {
        const { updates } = params;

        // Validate all orders first
        const invalidOrder = updates.find(
          (u) => typeof u.order !== "number" || u.order < 0,
        );

        if (invalidOrder) {
          return {
            success: false,
            error: "Invalid order value in batch update",
          };
        }

        const updatePromises = updates.map(({ id, order }) =>
          supabase
            .from("notes")
            .update({ order, updated_at: new Date().toISOString() })
            .eq("id", id)
            .eq("author", userId),
        );

        const results = await Promise.allSettled(updatePromises);
        const failures = results.filter(
          (result) => result.status === "rejected",
        );

        if (failures.length > 0) {
          return {
            success: false,
            error: `${failures.length} order updates failed`,
          };
        }

        return { success: true };
      }

      default:
        return { success: false, error: "Unknown operation" };
    }
  } catch (error) {
    console.error(`❌ Supabase operation ${operation} failed:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to ${operation}: ${errorMessage}` };
  }
}

// ===========================
// MAIN EXPORTED FUNCTION
// ===========================
export async function noteOperation(
  storage: "redis" | "supabase",
  params: NoteOperationParams,
): Promise<{
  success: boolean;
  notes?: RedisNote[];
  note?: any;
  version?: number;
  deletedNote?: RedisNote;
  error?: string;
}> {
  if (storage === "redis") {
    return handleRedisOperation(params) as any;
  } else {
    return handleSupabaseOperation(params) as any;
  }
}
