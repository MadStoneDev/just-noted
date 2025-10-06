"use server";

import redis from "@/utils/redis";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
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
} from "@/utils/validation";
import {
  NOTES_KEY_PREFIX,
  MAX_RETRIES,
  TWO_MONTHS_IN_SECONDS,
} from "@/constants/app";

// Types for operation parameters
type NoteOperationParams =
  | { operation: "create"; userId: string; note: CreateNoteInput | RedisNote }
  | {
      operation: "update";
      userId: string;
      noteId: string;
      content: string;
      goal?: number;
      goalType?: string;
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

// Utility functions
async function isBotRequest(action: string): Promise<boolean> {
  try {
    const headersList = await headers();
    const isBotHeader = headersList?.get("x-is-bot");
    const isBot = isBotHeader === "true";
    if (isBot) console.log(`Bot detected, skipping ${action}`);
    return isBot;
  } catch (headerError) {
    return false;
  }
}

async function getNotesWithRetry(
  userId: string,
  retries = MAX_RETRIES,
): Promise<RedisNote[]> {
  try {
    const notes = (await redis.get(`${NOTES_KEY_PREFIX}${userId}`)) as
      | RedisNote[]
      | null;
    return notes || [];
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return getNotesWithRetry(userId, retries - 1);
    }
    throw error;
  }
}

async function setNotesWithRetry(
  userId: string,
  notes: RedisNote[],
  retries = MAX_RETRIES,
): Promise<void> {
  try {
    await redis.setex(
      `${NOTES_KEY_PREFIX}${userId}`,
      TWO_MONTHS_IN_SECONDS,
      notes,
    );
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return setNotesWithRetry(userId, notes, retries - 1);
    }
    throw error;
  }
}

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

// Redis operations
async function handleRedisOperation(params: NoteOperationParams) {
  const { operation } = params;

  if (await isBotRequest(operation)) {
    return { success: true };
  }

  try {
    switch (operation) {
      case "create": {
        const { userId, note } = params;
        validateUserId(userId);

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

        const currentNotes = await getNotesWithRetry(userId);
        const updatedNotes = [newNote, ...currentNotes];
        await setNotesWithRetry(userId, updatedNotes);
        revalidatePath("/");
        return { success: true, notes: updatedNotes };
      }

      case "update": {
        const { userId, noteId, content, goal = 0, goalType = "" } = params;
        validateUserId(userId);

        if (!validateNoteContent(content)) {
          return {
            success: false,
            error: "Invalid content: Content must be a string",
          };
        }

        const currentNotes = await getNotesWithRetry(userId);
        const noteIndex = currentNotes.findIndex((note) => note.id === noteId);

        if (noteIndex === -1) {
          return {
            success: false,
            error: `Note ${noteId} not found. Please refresh and try again.`,
          };
        }

        const updatedNote = {
          ...currentNotes[noteIndex],
          content,
          goal: goal || 0,
          goal_type: validateGoalType(goalType),
          updatedAt: Date.now(),
        };

        const updatedNotes = [
          ...currentNotes.slice(0, noteIndex),
          updatedNote,
          ...currentNotes.slice(noteIndex + 1),
        ];
        await setNotesWithRetry(userId, updatedNotes);
        revalidatePath("/");
        return { success: true, notes: updatedNotes };
      }

      case "updateTitle": {
        const { userId, noteId, title } = params;
        if (!validateNoteTitle(title)) {
          return {
            success: false,
            error: "Invalid title: Title cannot be empty",
          };
        }
        validateUserId(userId);

        const currentNotes = await getNotesWithRetry(userId);
        const noteIndex = currentNotes.findIndex((note) => note.id === noteId);
        if (noteIndex === -1) {
          return { success: false, error: "Note not found" };
        }

        const updatedNote = {
          ...currentNotes[noteIndex],
          title: title.trim(),
          updatedAt: Date.now(),
        };
        const updatedNotes = [
          ...currentNotes.slice(0, noteIndex),
          updatedNote,
          ...currentNotes.slice(noteIndex + 1),
        ];
        await setNotesWithRetry(userId, updatedNotes);
        revalidatePath("/");
        return { success: true, notes: updatedNotes };
      }

      case "updatePin": {
        const { userId, noteId, isPinned } = params;
        validateUserId(userId);

        const currentNotes = await getNotesWithRetry(userId);
        const noteIndex = currentNotes.findIndex((note) => note.id === noteId);
        if (noteIndex === -1) {
          return { success: false, error: "Note not found" };
        }

        const updatedNote = {
          ...currentNotes[noteIndex],
          pinned: isPinned,
          updatedAt: Date.now(),
        };
        const updatedNotes = [
          ...currentNotes.slice(0, noteIndex),
          updatedNote,
          ...currentNotes.slice(noteIndex + 1),
        ];
        await setNotesWithRetry(userId, updatedNotes);
        revalidatePath("/");
        return { success: true, notes: updatedNotes };
      }

      case "updatePrivacy": {
        const { userId, noteId, isPrivate } = params;
        validateUserId(userId);

        const currentNotes = await getNotesWithRetry(userId);
        const noteIndex = currentNotes.findIndex((note) => note.id === noteId);
        if (noteIndex === -1) {
          return { success: false, error: "Note not found" };
        }

        const updatedNote = {
          ...currentNotes[noteIndex],
          isPrivate,
          updatedAt: Date.now(),
        };
        const updatedNotes = [
          ...currentNotes.slice(0, noteIndex),
          updatedNote,
          ...currentNotes.slice(noteIndex + 1),
        ];
        await setNotesWithRetry(userId, updatedNotes);
        revalidatePath("/");
        return { success: true, notes: updatedNotes };
      }

      case "updateCollapsed": {
        const { userId, noteId, isCollapsed } = params;
        validateUserId(userId);

        const currentNotes = await getNotesWithRetry(userId);
        const noteIndex = currentNotes.findIndex((note) => note.id === noteId);
        if (noteIndex === -1) {
          return { success: false, error: "Note not found" };
        }

        const updatedNote = {
          ...currentNotes[noteIndex],
          isCollapsed,
          updatedAt: Date.now(),
        };
        const updatedNotes = [
          ...currentNotes.slice(0, noteIndex),
          updatedNote,
          ...currentNotes.slice(noteIndex + 1),
        ];
        await setNotesWithRetry(userId, updatedNotes);
        revalidatePath("/");
        return { success: true, notes: updatedNotes };
      }

      case "updateOrder": {
        const { userId, noteId, order } = params;
        validateUserId(userId);

        const currentNotes = await getNotesWithRetry(userId);
        const noteIndex = currentNotes.findIndex((note) => note.id === noteId);
        if (noteIndex === -1) {
          return { success: false, error: "Note not found" };
        }

        const updatedNote = {
          ...currentNotes[noteIndex],
          order,
          updatedAt: Date.now(),
        };
        const updatedNotes = [
          ...currentNotes.slice(0, noteIndex),
          updatedNote,
          ...currentNotes.slice(noteIndex + 1),
        ];
        await setNotesWithRetry(userId, updatedNotes);
        revalidatePath("/");
        return { success: true, notes: updatedNotes };
      }

      case "delete": {
        const { userId, noteId } = params;
        validateUserId(userId);

        const currentNotes = await getNotesWithRetry(userId);
        const noteToDelete = currentNotes.find((note) => note.id === noteId);
        if (!noteToDelete) {
          return { success: false, error: "Note not found" };
        }

        const updatedNotes = currentNotes.filter((note) => note.id !== noteId);
        await setNotesWithRetry(userId, updatedNotes);
        revalidatePath("/");
        return {
          success: true,
          notes: updatedNotes,
          deletedNote: noteToDelete,
        };
      }

      case "getAll": {
        const { userId } = params;
        validateUserId(userId);
        const notes = await getNotesWithRetry(userId);
        return { success: true, notes };
      }

      case "batchUpdateOrders": {
        const { userId, updates } = params;
        validateUserId(userId);

        const currentNotes = await getNotesWithRetry(userId);
        const updateMap = new Map(updates.map((u) => [u.id, u.order]));

        const updatedNotes = currentNotes.map((note) => {
          const newOrder = updateMap.get(note.id);
          if (newOrder !== undefined) {
            return { ...note, order: newOrder, updatedAt: Date.now() };
          }
          return note;
        });

        await setNotesWithRetry(userId, updatedNotes);
        revalidatePath("/");
        return { success: true };
      }

      default:
        return { success: false, error: "Unknown operation" };
    }
  } catch (error) {
    console.error(`Redis operation ${operation} failed:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to ${operation}: ${errorMessage}` };
  }
}

// Supabase operations
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

        const { error } = await supabase
          .from("notes")
          .delete()
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
    console.error(`Supabase operation ${operation} failed:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to ${operation}: ${errorMessage}` };
  }
}

// Main exported function
export async function noteOperation(
  storage: "redis" | "supabase",
  params: NoteOperationParams,
) {
  if (storage === "redis") {
    return handleRedisOperation(params);
  } else {
    return handleSupabaseOperation(params);
  }
}
