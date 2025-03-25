"use server";

import { revalidatePath } from "next/cache";

import redis from "@/utils/redis";
import { Note } from "@/types/notes";

// Helper function to add or update timestamps
function addTimestamp(note: Note): Note {
  return {
    ...note,
    updatedAt: Date.now(), // Current timestamp in milliseconds
  };
}

// Function to check if a note is older than 6 months
function isOlderThanSixMonths(note: Note): boolean {
  if (!note.updatedAt) return false;

  const sixMonthsInMs = 6 * 30 * 24 * 60 * 60 * 1000; // Approximate 6 months in milliseconds
  const currentTime = Date.now();

  return currentTime - note.updatedAt > sixMonthsInMs;
}

export async function deleteNoteAction(userId: string, noteId: string) {
  try {
    const currentNotes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];

    const updatedNotes = currentNotes.filter((note) => note.id !== noteId);

    await redis.set(`notes:${userId}`, updatedNotes);

    revalidatePath("/");
    return { success: true, notes: updatedNotes };
  } catch (error) {
    console.error("Failed to delete note:", error);
    return { success: false, error: "Failed to delete note" };
  }
}

export async function updateNoteAction(
  userId: string,
  noteId: string,
  content: string,
) {
  try {
    const currentNotes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];

    const noteIndex = currentNotes.findIndex((note) => note.id === noteId);

    if (noteIndex === -1) {
      throw new Error(`Note with ID ${noteId} not found`);
    }

    const updatedNotes = [...currentNotes];
    updatedNotes[noteIndex] = addTimestamp({
      ...updatedNotes[noteIndex],
      content,
    });

    await redis.set(`notes:${userId}`, updatedNotes);

    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Failed to update note:", error);
    return { success: false, error: String(error) };
  }
}

export async function getNotesByUserIdAction(userId: string) {
  try {
    const notes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];
    return { success: true, notes };
  } catch (error) {
    console.error("Failed to get notes:", error);
    return { success: false, error: "Failed to get notes" };
  }
}

export async function addNoteAction(userId: string, newNote: Note) {
  try {
    const currentNotes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];

    // Add timestamp to the new note
    const noteWithTimestamp = addTimestamp(newNote);

    const updatedNotes = [noteWithTimestamp, ...currentNotes];

    await redis.set(`notes:${userId}`, updatedNotes);

    revalidatePath("/");
    return { success: true, notes: updatedNotes };
  } catch (error) {
    console.error("Failed to add note:", error);
    return { success: false, error: "Failed to add note" };
  }
}

export async function updateNoteTitleAction(
  userId: string,
  noteId: string,
  title: string,
) {
  try {
    const currentNotes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];

    const updatedNotes = currentNotes.map((note) =>
      note.id === noteId ? addTimestamp({ ...note, title }) : note,
    );

    await redis.set(`notes:${userId}`, updatedNotes);

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Failed to update note title:", error);
    return { success: false, error: "Failed to update note title" };
  }
}

// Function to clean up old notes (older than 6 months)
export async function cleanupOldNotesAction() {
  try {
    // Get all user keys
    const userKeysPattern = "notes:*";
    const userKeys = await redis.keys(userKeysPattern);

    let totalCleanedUp = 0;

    for (const userKey of userKeys) {
      const userId = userKey.split(":")[1]; // Extract user ID from the key
      const notes = ((await redis.get(userKey)) as Note[]) || [];

      // Filter out notes older than 6 months
      const currentNotes = notes.filter((note) => !isOlderThanSixMonths(note));

      // If we removed any notes, update Redis
      if (currentNotes.length < notes.length) {
        totalCleanedUp += notes.length - currentNotes.length;
        await redis.set(userKey, currentNotes);
      }
    }

    return {
      success: true,
      message: `Cleanup completed. Removed ${totalCleanedUp} old notes.`,
    };
  } catch (error) {
    console.error("Failed to clean up old notes:", error);
    return { success: false, error: "Failed to clean up old notes" };
  }
}
