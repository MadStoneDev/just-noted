"use server";

import redis from "@/utils/redis";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { RedisNote, CreateNoteInput } from "@/types/combined-notes";
import { incrementGlobalNoteCount } from "./counterActions";
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

// Utility functions
async function isBotRequest(action: string): Promise<boolean> {
  try {
    const headersList = await headers();
    const isBotHeader = headersList?.get("x-is-bot");
    const isBot = isBotHeader === "true";

    if (isBot) {
      console.log(`Bot detected, skipping ${action}`);
    }

    return isBot;
  } catch (headerError) {
    console.log(
      `Headers not available during ${action}, assuming not a bot request`,
    );
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
      console.warn(
        `Failed to get notes, retrying... (${retries} attempts left)`,
      );
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
      console.warn(
        `Failed to set notes, retrying... (${retries} attempts left)`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return setNotesWithRetry(userId, notes, retries - 1);
    }
    throw error;
  }
}

function sortNotesByPinStatus(notes: RedisNote[]): RedisNote[] {
  return [...notes].sort((a, b) => {
    // First sort by pin status (pinned notes first)
    if ((a.pinned ?? false) && !(b.pinned ?? false)) return -1;
    if (!(a.pinned ?? false) && (b.pinned ?? false)) return 1;

    // If both notes have order values, use them for sorting
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }

    // For pinned notes without order, sort by updatedAt (most recent first)
    if (a.pinned && b.pinned) {
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    }

    // For unpinned notes without order, sort by createdAt (most recent first)
    return (b.createdAt ?? 0) - (a.createdAt ?? 0);
  });
}

async function updateNoteProperty(
  userId: string,
  noteId: string,
  updateFn: (note: RedisNote) => RedisNote,
): Promise<RedisNote[]> {
  const currentNotes = await getNotesWithRetry(userId);
  const noteIndex = currentNotes.findIndex((note) => note.id === noteId);

  if (noteIndex === -1) {
    throw new Error(`Note ${noteId} not found for user ${userId}`);
  }

  const updatedNote = updateFn(currentNotes[noteIndex]);

  // Basic validation for updated note
  if (
    !updatedNote.id ||
    !updatedNote.title ||
    typeof updatedNote.content !== "string"
  ) {
    throw new Error("Invalid note data after update");
  }

  const updatedNotes = [
    ...currentNotes.slice(0, noteIndex),
    updatedNote,
    ...currentNotes.slice(noteIndex + 1),
  ];

  await setNotesWithRetry(userId, updatedNotes);
  return updatedNotes;
}

// Convert CreateNoteInput to RedisNote
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

// Main action functions
export async function deleteNoteAction(userId: string, noteId: string) {
  try {
    if (await isBotRequest("note delete")) {
      return { success: true };
    }

    validateUserId(userId);

    const currentNotes = await getNotesWithRetry(userId);
    const noteToDelete = currentNotes.find((note) => note.id === noteId);

    if (!noteToDelete) {
      return {
        success: false,
        error: `Note with ID ${noteId} not found for user ${userId}`,
      };
    }

    const updatedNotes = currentNotes.filter((note) => note.id !== noteId);
    await setNotesWithRetry(userId, updatedNotes);

    revalidatePath("/");
    return {
      success: true,
      notes: updatedNotes,
      deletedNote: noteToDelete,
    };
  } catch (error) {
    console.error("Failed to delete note:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to delete note: ${errorMessage}`,
    };
  }
}

export async function updateNoteAction(
  userId: string,
  noteId: string,
  content: string,
  wordCountGoal: number = 0,
  wordCountGoalType: string = "",
) {
  try {
    if (await isBotRequest("note update")) {
      return { success: true };
    }

    validateUserId(userId);

    // Validate inputs
    if (!validateNoteContent(content)) {
      return {
        success: false,
        error: "Invalid content: Content must be a string",
      };
    }

    const goalType = validateGoalType(wordCountGoalType);

    try {
      const updatedNotes = await updateNoteProperty(userId, noteId, (note) => ({
        ...note,
        content,
        goal: wordCountGoal || 0,
        goal_type: goalType,
        updatedAt: Date.now(),
      }));

      revalidatePath("/");
      return {
        success: true,
        notes: updatedNotes,
      };
    } catch (error) {
      // If note doesn't exist, create a new one
      if (error instanceof Error && error.message.includes("not found")) {
        console.log(
          `Note ${noteId} not found for user ${userId}, creating new note`,
        );

        const currentNotes = await getNotesWithRetry(userId);
        const noteNumber = await incrementGlobalNoteCount();

        const newNoteInput: CreateNoteInput = {
          id: noteId,
          title: `Just Noted #${noteNumber}`,
          content,
          goal: wordCountGoal || 0,
          goal_type: goalType,
        };

        const newNote = createNoteInputToRedisNote(newNoteInput, userId);
        const updatedNotes = [newNote, ...currentNotes];

        await setNotesWithRetry(userId, updatedNotes);

        revalidatePath("/");
        return {
          success: true,
          notes: updatedNotes,
        };
      }
      throw error;
    }
  } catch (error) {
    console.error("Failed to update note:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note content: ${errorMessage}`,
    };
  }
}

export async function getNotesByUserIdAction(userId: string) {
  try {
    validateUserId(userId);

    const notes = await getNotesWithRetry(userId);
    return { success: true, notes };
  } catch (error) {
    console.error("Failed to get notes:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to retrieve notes: ${errorMessage}`,
    };
  }
}

export async function addNoteAction(
  userId: string,
  newNoteInput: CreateNoteInput | RedisNote,
) {
  try {
    if (await isBotRequest("note add")) {
      return { success: true };
    }

    validateUserId(userId);

    if (!newNoteInput?.id?.trim()) {
      return {
        success: false,
        error: "Invalid note data: Note must have an ID",
      };
    }

    // Convert to RedisNote if it's CreateNoteInput
    let newNote: RedisNote;
    if ("createdAt" in newNoteInput && "updatedAt" in newNoteInput) {
      // It's already a RedisNote
      newNote = newNoteInput;
    } else {
      // Convert CreateNoteInput to RedisNote
      const noteNumber = await incrementGlobalNoteCount();
      const input = newNoteInput as CreateNoteInput;

      newNote = createNoteInputToRedisNote(
        {
          ...input,
          title:
            input.title === "Just Noted"
              ? `Just Noted #${noteNumber}`
              : input.title,
        },
        userId,
      );
    }

    const currentNotes = await getNotesWithRetry(userId);
    const updatedNotes = [newNote, ...currentNotes];

    await setNotesWithRetry(userId, updatedNotes);

    revalidatePath("/");
    return { success: true, notes: updatedNotes };
  } catch (error) {
    console.error("Failed to add note:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to add note: ${errorMessage}`,
    };
  }
}

export async function updateNoteTitleAction(
  userId: string,
  noteId: string,
  title: string,
) {
  try {
    if (await isBotRequest("note title update")) {
      return { success: true };
    }

    if (!validateNoteTitle(title)) {
      return {
        success: false,
        error: "Invalid title: Title cannot be empty",
      };
    }

    validateUserId(userId);

    const updatedNotes = await updateNoteProperty(userId, noteId, (note) => ({
      ...note,
      title: title.trim(),
      updatedAt: Date.now(),
    }));

    revalidatePath("/");
    return {
      success: true,
      notes: updatedNotes,
    };
  } catch (error) {
    console.error("Failed to update note title:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note title: ${errorMessage}`,
    };
  }
}

export async function updateNotePinStatusAction(
  userId: string,
  noteId: string,
  pinned: boolean,
) {
  try {
    if (await isBotRequest("note pin status update")) {
      return { success: true };
    }

    validateUserId(userId);

    const updatedNotes = await updateNoteProperty(userId, noteId, (note) => ({
      ...note,
      pinned,
      updatedAt: Date.now(),
    }));

    const sortedNotes = sortNotesByPinStatus(updatedNotes);
    await setNotesWithRetry(userId, sortedNotes);

    revalidatePath("/");
    return {
      success: true,
      notes: sortedNotes,
    };
  } catch (error) {
    console.error("Failed to update note pin status:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note pin status: ${errorMessage}`,
    };
  }
}

export async function updateNotePrivacyStatusAction(
  userId: string,
  noteId: string,
  isPrivate: boolean,
) {
  try {
    if (await isBotRequest("note privacy update")) {
      return { success: true };
    }

    validateUserId(userId);

    const updatedNotes = await updateNoteProperty(userId, noteId, (note) => ({
      ...note,
      isPrivate,
      updatedAt: Date.now(),
    }));

    revalidatePath("/");
    return {
      success: true,
      notes: updatedNotes,
    };
  } catch (error) {
    console.error("Failed to update note privacy status:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note privacy status: ${errorMessage}`,
    };
  }
}

export async function updateNoteCollapsedStatusAction(
  userId: string,
  noteId: string,
  isCollapsed: boolean,
) {
  try {
    if (await isBotRequest("note collapse status update")) {
      return { success: true };
    }

    validateUserId(userId);

    const updatedNotes = await updateNoteProperty(userId, noteId, (note) => ({
      ...note,
      isCollapsed,
      updatedAt: Date.now(),
    }));

    revalidatePath("/");
    return {
      success: true,
      notes: updatedNotes,
    };
  } catch (error) {
    console.error("Failed to update note collapsed status:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note collapsed status: ${errorMessage}`,
    };
  }
}

export async function updateNoteOrderAction(
  userId: string,
  noteId: string,
  newOrder: number,
) {
  try {
    if (await isBotRequest("note order update")) {
      return { success: true };
    }

    validateUserId(userId);

    const updatedNotes = await updateNoteProperty(userId, noteId, (note) => ({
      ...note,
      order: newOrder,
      updatedAt: Date.now(),
    }));

    revalidatePath("/");
    return {
      success: true,
      notes: updatedNotes,
    };
  } catch (error) {
    console.error("Failed to update note order:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note order: ${errorMessage}`,
    };
  }
}

// Create batch update for Redis (to match Supabase)
export async function batchUpdateRedisNoteOrders(
  userId: string,
  updates: { id: string; order: number }[],
) {
  try {
    if (await isBotRequest("batch note order update")) {
      return { success: true };
    }

    validateUserId(userId);

    const currentNotes = await getNotesWithRetry(userId);

    // Create a map for quick lookups
    const updateMap = new Map(updates.map((u) => [u.id, u.order]));

    // Update notes with new orders
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
  } catch (error) {
    console.error("Failed to batch update note orders:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to batch update note orders: ${errorMessage}`,
    };
  }
}
