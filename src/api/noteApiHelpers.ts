"use server";

import { revalidatePath } from "next/cache";
import redis from "@/utils/redis";
import { Note } from "@/types/notes";

/**
 * Wrapper for Redis operations with retry logic
 */
async function safeRedisOperation<T>(
  operation: () => Promise<T>,
  errorMessage: string,
  maxRetries = 3,
): Promise<{ success: boolean; data?: T; error?: string }> {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error) {
      console.error(
        `${errorMessage} (attempt ${retries + 1}/${maxRetries}):`,
        error,
      );
      retries++;

      // Only retry on network errors or Redis connection issues
      if (
        error instanceof Error &&
        !error.message.includes("ECONNREFUSED") &&
        !error.message.includes("ETIMEDOUT") &&
        !error.message.includes("network")
      ) {
        return {
          success: false,
          error: `${errorMessage}: ${error.message}`,
        };
      }

      // Exponential backoff
      if (retries < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, 300 * Math.pow(2, retries)),
        );
      }
    }
  }

  return {
    success: false,
    error: `${errorMessage}: Max retries exceeded`,
  };
}

/**
 * Check if the request is from a bot
 */
function isBotRequest(): boolean {
  try {
    const { headers } = require("next/headers");
    const isBotHeader = headers().get("x-is-bot");
    return isBotHeader === "true";
  } catch (error) {
    console.error("Error checking bot status:", error);
    return false;
  }
}

/**
 * Add timestamps to a note
 */
function addTimestamps(note: Note): Note {
  const now = Date.now();

  return {
    ...note,
    createdAt: note.createdAt || now,
    updatedAt: now,
  };
}

/**
 * Get all notes for a user with error handling
 */
export async function getNotesByUserIdSafe(userId: string): Promise<{
  success: boolean;
  notes?: Note[];
  error?: string;
}> {
  if (isBotRequest()) {
    console.log("Bot detected, returning empty notes array");
    return { success: true, notes: [] };
  }

  const result = await safeRedisOperation(async () => {
    const notes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];
    return notes;
  }, "Failed to get notes");

  return {
    success: result.success,
    notes: result.data as Note[] | undefined,
    error: result.error,
  };
}

/**
 * Update note content with error handling
 */
export async function updateNoteContentSafe(
  userId: string,
  noteId: string,
  content: string,
): Promise<{
  success: boolean;
  error?: string;
}> {
  if (isBotRequest()) {
    console.log("Bot detected, skipping note update");
    return { success: true };
  }

  const result = await safeRedisOperation(async () => {
    // Get current notes
    const currentNotes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];
    const noteIndex = currentNotes.findIndex((note) => note.id === noteId);

    if (noteIndex === -1) {
      throw new Error("Note not found");
    }

    // Update the note
    const updatedNotes = [...currentNotes];
    updatedNotes[noteIndex] = {
      ...updatedNotes[noteIndex],
      content,
      updatedAt: Date.now(),
    };

    // Save to Redis
    await redis.set(`notes:${userId}`, updatedNotes);

    // Revalidate paths
    revalidatePath("/");

    return true;
  }, "Failed to update note content");

  return {
    success: result.success && result.data === true,
    error: result.error,
  };
}

/**
 * Delete a note with optimistic updates
 */
export async function deleteNoteSafe(
  userId: string,
  noteId: string,
): Promise<{
  success: boolean;
  notes?: Note[];
  error?: string;
}> {
  if (isBotRequest()) {
    console.log("Bot detected, skipping note deletion");
    return { success: true, notes: [] };
  }

  const result = await safeRedisOperation(async () => {
    const currentNotes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];
    const updatedNotes = currentNotes.filter((note) => note.id !== noteId);

    await redis.set(`notes:${userId}`, updatedNotes);
    revalidatePath("/");

    return updatedNotes;
  }, "Failed to delete note");

  return {
    success: result.success,
    notes: result.data as Note[] | undefined,
    error: result.error,
  };
}

/**
 * Toggle pin status with optimistic updates
 */
export async function toggleNotePinStatusSafe(
  userId: string,
  noteId: string,
  pinStatus: boolean,
): Promise<{
  success: boolean;
  notes?: Note[];
  error?: string;
}> {
  if (isBotRequest()) {
    console.log("Bot detected, skipping pin status update");
    return { success: true, notes: [] };
  }

  const result = await safeRedisOperation(
    async () => {
      const currentNotes =
        ((await redis.get(`notes:${userId}`)) as Note[]) || [];
      const noteIndex = currentNotes.findIndex((note) => note.id === noteId);

      if (noteIndex === -1) {
        throw new Error("Note not found");
      }

      // Create a copy of notes array
      const updatedNotes = [...currentNotes];

      // Update the note
      const now = Date.now();
      updatedNotes[noteIndex] = {
        ...updatedNotes[noteIndex],
        pinned: pinStatus,
        updatedAt: now,
        createdAt:
          updatedNotes[noteIndex].createdAt ||
          updatedNotes[noteIndex].updatedAt ||
          now,
      };

      // Save to Redis
      await redis.set(`notes:${userId}`, updatedNotes);

      // Revalidate
      revalidatePath("/");

      return updatedNotes;
    },
    `Failed to ${pinStatus ? "pin" : "unpin"} note`,
  );

  return {
    success: result.success,
    notes: result.data as Note[] | undefined,
    error: result.error,
  };
}

/**
 * Reorder a note with safe handling
 */
export async function reorderNoteSafe(
  userId: string,
  noteId: string,
  direction: "up" | "down",
): Promise<{
  success: boolean;
  notes?: Note[];
  error?: string;
}> {
  if (isBotRequest()) {
    console.log("Bot detected, skipping note reordering");
    return { success: true, notes: [] };
  }

  const result = await safeRedisOperation(async () => {
    const currentNotes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];
    const noteIndex = currentNotes.findIndex((note) => note.id === noteId);

    if (noteIndex === -1) {
      throw new Error("Note not found");
    }

    // Get the current note
    const currentNote = currentNotes[noteIndex];

    // Separate pinned and unpinned notes
    const pinnedNotes = currentNotes.filter((note) => note.pinned);
    const unpinnedNotes = currentNotes.filter((note) => !note.pinned);

    // Handle reordering based on pin status
    if (currentNote.pinned) {
      // For pinned notes
      const pinnedIndex = pinnedNotes.findIndex((note) => note.id === noteId);

      if (direction === "up" && pinnedIndex > 0) {
        [pinnedNotes[pinnedIndex], pinnedNotes[pinnedIndex - 1]] = [
          pinnedNotes[pinnedIndex - 1],
          pinnedNotes[pinnedIndex],
        ];
      } else if (direction === "down" && pinnedIndex < pinnedNotes.length - 1) {
        [pinnedNotes[pinnedIndex], pinnedNotes[pinnedIndex + 1]] = [
          pinnedNotes[pinnedIndex + 1],
          pinnedNotes[pinnedIndex],
        ];
      }

      // Assign explicit order values
      pinnedNotes.forEach((note, index) => {
        note.order = index;
      });

      // Recombine notes
      const updatedNotes = [...pinnedNotes, ...unpinnedNotes];
      await redis.set(`notes:${userId}`, updatedNotes);
      revalidatePath("/");

      return updatedNotes;
    } else {
      // For unpinned notes
      const unpinnedIndex = unpinnedNotes.findIndex(
        (note) => note.id === noteId,
      );

      if (direction === "up" && unpinnedIndex > 0) {
        [unpinnedNotes[unpinnedIndex], unpinnedNotes[unpinnedIndex - 1]] = [
          unpinnedNotes[unpinnedIndex - 1],
          unpinnedNotes[unpinnedIndex],
        ];
      } else if (
        direction === "down" &&
        unpinnedIndex < unpinnedNotes.length - 1
      ) {
        [unpinnedNotes[unpinnedIndex], unpinnedNotes[unpinnedIndex + 1]] = [
          unpinnedNotes[unpinnedIndex + 1],
          unpinnedNotes[unpinnedIndex],
        ];
      }

      // Assign explicit order values
      const pinnedCount = pinnedNotes.length;
      unpinnedNotes.forEach((note, index) => {
        note.order = pinnedCount + index;
      });

      // Recombine notes
      const updatedNotes = [...pinnedNotes, ...unpinnedNotes];
      await redis.set(`notes:${userId}`, updatedNotes);
      revalidatePath("/");

      return updatedNotes;
    }
  }, `Failed to reorder note ${direction}`);

  return {
    success: result.success,
    notes: result.data as Note[] | undefined,
    error: result.error,
  };
}
