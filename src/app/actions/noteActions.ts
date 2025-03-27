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

export async function deleteNoteAction(userId: string, noteId: string) {
  try {
    // Check if the request is from a bot using the header set in middleware
    const { headers } = require("next/headers");
    const isBotHeader = headers().get("x-is-bot");
    const isBot = isBotHeader === "true";

    // Don't save notes for bots
    if (isBot) {
      console.log("Bot detected, skipping note deletion");
      return {
        success: true,
        notes: [],
      };
    }

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
    // Check if the request is from a bot using the header set in middleware
    const { headers } = require("next/headers");
    const isBotHeader = headers().get("x-is-bot");
    const isBot = isBotHeader === "true";

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
    const isBotHeader = headers().get("x-is-bot");
    const isBot = isBotHeader === "true";

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
    // Check if the request is from a bot using the header set in middleware
    const { headers } = require("next/headers");
    const isBotHeader = headers().get("x-is-bot");
    const isBot = isBotHeader === "true";

    // Don't save notes for bots
    if (isBot) {
      console.log("Bot detected, skipping note creation");
      return {
        success: true,
      };
    }

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
