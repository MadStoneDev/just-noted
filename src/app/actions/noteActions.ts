"use server";

import { revalidatePath } from "next/cache";

import redis from "@/utils/redis";

import { Note } from "@/types/notes";
import { incrementGlobalNoteCount } from "./counterActions";
import { headers } from "next/headers";

function addTimestamp(note: Note): Note {
  return {
    ...note,
    updatedAt: Date.now(),
  };
}

function isTooOld(note: Note): boolean {
  if (!note.updatedAt) return false;

  const sixMonthsInMs = 2 * 30 * 24 * 60 * 60 * 1000; // Approximate 2 months in milliseconds
  const currentTime = Date.now();

  return currentTime - note.updatedAt > sixMonthsInMs;
}

export async function deleteNoteAction(userId: string, noteId: string) {
  try {
    const currentNotes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];
    const updatedNotes = currentNotes.filter((note) => note.id !== noteId);

    const savePromise = redis.set(`notes:${userId}`, updatedNotes);
    const result = { success: true, notes: updatedNotes };

    savePromise
      .then(() => {
        revalidatePath("/");
      })
      .catch((error) => {
        console.error("Failed to delete note:", error);
      });

    return result;
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
    // Check if the request is from a bot using the header set in middleware
    const { headers } = require("next/headers");
    const botInfo = headers().get("x-vercel-bot");
    const isBot = botInfo ? JSON.parse(botInfo).isBot : false;

    // Don't update notes for bots
    if (isBot) {
      console.log("Bot detected, skipping note update");
      return { success: true };
    }

    // Validate the user ID
    const { isUserIdActive, registerUserId } = await import(
      "@/utils/userIdManagement"
    );

    // Check if user ID is active
    const isActive = await isUserIdActive(userId);

    // If not active, register it - this could be a valid user with a cleared Redis cache
    if (!isActive) {
      await registerUserId(userId);
    }

    let currentNotes: Note[] = [];

    try {
      // Try to get existing notes
      currentNotes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];
    } catch (error) {
      // If the record doesn't exist, create a new note instead
      console.log(
        `No existing notes for user ${userId}, creating new record with this note`,
      );

      // Create a new note with the provided content
      const newNote: Note = {
        id: noteId,
        title: "Just Noted",
        content,
        updatedAt: Date.now(),
      };

      // Get the next note number for the title
      const noteNumber = await incrementGlobalNoteCount();
      newNote.title = `Just Noted #${noteNumber}`;

      await redis.set(`notes:${userId}`, [newNote]);

      revalidatePath("/");
      return { success: true };
    }

    const noteIndex = currentNotes.findIndex((note) => note.id === noteId);

    if (noteIndex === -1) {
      // Note not found - create a new note with this ID instead of throwing an error
      console.log(
        `Note ${noteId} not found for user ${userId}, creating new note`,
      );

      // Create a new note with the provided ID and content
      const newNote: Note = {
        id: noteId,
        title: "Just Noted",
        content,
        updatedAt: Date.now(),
      };

      // Get the next note number for the title
      const noteNumber = await incrementGlobalNoteCount();
      newNote.title = `Just Noted #${noteNumber}`;

      // Add the new note to the list
      currentNotes.unshift(newNote);

      await redis.set(`notes:${userId}`, currentNotes);

      revalidatePath("/");
      return { success: true };
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
    // Check if the request is from a bot using the header set in middleware
    const { headers } = require("next/headers");
    const botInfo = headers().get("x-vercel-bot");
    const isBot = botInfo ? JSON.parse(botInfo).isBot : false;

    // Don't save notes for bots
    if (isBot) {
      console.log("Bot detected, skipping note creation");
      return {
        success: true,
        notes: [],
      };
    }

    // Validate and register the user ID
    const { isUserIdActive, registerUserId } = await import(
      "@/utils/userIdManagement"
    );

    // Check if user ID is active
    const isActive = await isUserIdActive(userId);

    // If not active, register it
    if (!isActive) {
      await registerUserId(userId);
    }

    // Get the next note number by incrementing the global counter
    const noteNumber = await incrementGlobalNoteCount();

    // Update the note title to include the number if it's the default title
    if (newNote.title === "Just Noted") {
      newNote.title = `Just Noted #${noteNumber}`;
    }

    // Add timestamp to the new note
    const noteWithTimestamp = addTimestamp(newNote);

    let currentNotes: Note[] = [];

    try {
      // Try to get existing notes
      currentNotes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];
    } catch (error) {
      // If the record doesn't exist, just log it and continue with an empty array
      console.log(`No existing notes for user ${userId}, creating new record`);
      // currentNotes already initialized as empty array
    }

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

// Function to clean up old notes and maintain user ID registry
export async function cleanupOldNotesAction() {
  try {
    // Import the user ID management functions
    const { removeUserId, registerUserId, getAllActiveUserIds } = await import(
      "@/utils/userIdManagement"
    );

    // Get all user keys
    const userKeysPattern = "notes:*";
    const userKeys = await redis.keys(userKeysPattern);

    let totalCleanedUp = 0;
    let totalUsersRemoved = 0;
    let totalUsersAdded = 0;

    // Get current set of active user IDs for comparison
    const currentActiveUserIds = await getAllActiveUserIds();
    const userIdsInRedis = new Set();

    // Process all user records
    for (const userKey of userKeys) {
      const userId = userKey.split(":")[1]; // Extract user ID from the key
      userIdsInRedis.add(userId);

      const notes = ((await redis.get(userKey)) as Note[]) || [];

      // Check if this user has any recent notes (activity within 2 months)
      const hasRecentActivity = notes.some((note) => !isTooOld(note));

      // Filter out notes older than 2 months
      const currentNotes = notes.filter((note) => !isTooOld(note));

      // If we removed any notes, update Redis
      if (currentNotes.length < notes.length) {
        totalCleanedUp += notes.length - currentNotes.length;

        // If no notes remain, remove the entire user record
        if (currentNotes.length === 0) {
          await redis.del(userKey);
          await removeUserId(userId);
          totalUsersRemoved++;
        } else {
          await redis.set(userKey, currentNotes);

          // Ensure active user is in the global registry
          if (hasRecentActivity && !currentActiveUserIds.includes(userId)) {
            await registerUserId(userId);
            totalUsersAdded++;
          }
        }
      } else if (hasRecentActivity && !currentActiveUserIds.includes(userId)) {
        // User has notes but isn't in the active registry - add them
        await registerUserId(userId);
        totalUsersAdded++;
      }
    }

    // Clean up global registry - remove IDs that don't have corresponding notes
    let orphanedUsersRemoved = 0;
    for (const activeUserId of currentActiveUserIds) {
      if (!userIdsInRedis.has(activeUserId)) {
        await removeUserId(activeUserId);
        orphanedUsersRemoved++;
      }
    }

    return {
      success: true,
      message: `Cleanup completed. Removed ${totalCleanedUp} old notes, ${totalUsersRemoved} inactive users, and ${orphanedUsersRemoved} orphaned user IDs. Added ${totalUsersAdded} missing active users to registry.`,
    };
  } catch (error) {
    console.error("Failed to clean up old notes:", error);
    return { success: false, error: "Failed to clean up old notes" };
  }
}
