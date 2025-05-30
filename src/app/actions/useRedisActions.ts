"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import redis from "@/utils/redis";
import { Note } from "@/types/notes";
import { incrementGlobalNoteCount } from "@/app/actions/counterActions";

// Redis Keys
const NOTES_PREFIX = "notes:";

// Constants
const TWO_MONTHS_IN_SECONDS = 2 * 30 * 24 * 60 * 60;

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

// Get Notes by Local User ID
export const getNotesByUserId = async (
  userId: string,
): Promise<{
  success: boolean;
  notes?: Note[];
  error?: string;
}> => {
  try {
    if (!userId) {
      return {
        success: false,
        error: "User ID is required",
      };
    }

    const rawNotes = await redis.get(`${NOTES_PREFIX}${userId}`);
    let notes: Note[] = [];

    if (typeof rawNotes === "string") {
      notes = rawNotes ? JSON.parse(rawNotes) : [];
    }

    return {
      success: true,
      notes,
    };
  } catch (error) {
    console.error("Error fetching notes:", error);
    return {
      success: false,
      error: "Failed to get notes",
      notes: [],
    };
  }
};

// Update Note with Function
export const updateNoteWithFunction = async (
  userId: string,
  noteId: string,
  fn: (note: Note) => Note,
) => {
  try {
    if (!userId) {
      return {
        success: false,
        error: "User ID is required",
      };
    }

    const notesData = await getNotesByUserId(userId);

    if (!notesData.success || !notesData.notes) {
      return {
        success: false,
        error: "Failed to get notes",
      };
    }

    const noteIndex = notesData.notes.findIndex((note) => note.id === noteId);

    if (noteIndex === -1) {
      return {
        success: false,
        error: "Note not found",
      };
    }

    const updatedNote = fn(notesData.notes[noteIndex]);

    notesData.notes[noteIndex] = {
      ...updatedNote,
      updatedAt: Date.now(),
    };

    await redis.setex(
      `${NOTES_PREFIX}${userId}`,
      TWO_MONTHS_IN_SECONDS,
      JSON.stringify(notesData.notes),
    );

    return {
      success: true,
      notes: notesData.notes,
    };
  } catch (error) {
    console.error("Failed to update note:", error);
    return {
      success: false,
      error: "Failed to update note",
    };
  }
};

// Add a New Note
export const addNewNote = async (userId: string, newNote: Note) => {
  try {
    if (await isBotRequest("note add")) {
      return {
        success: true,
      };
    }

    if (!userId) {
      return {
        success: false,
        error: "User ID is required",
      };
    }

    if (!newNote) {
      return {
        success: false,
        error: "Note is required",
      };
    }

    const rawNotes = await redis.get(`${NOTES_PREFIX}${userId}`);
    let notes: Note[] = [];

    if (typeof rawNotes === "string") {
      notes = rawNotes ? JSON.parse(rawNotes) : [];
    }

    const noteNumber = await incrementGlobalNoteCount();

    const now = Date.now();
    const updatedNewNote = {
      ...newNote,
      title:
        newNote.title === "Just Noted"
          ? `Just Noted #${noteNumber}`
          : newNote.title,
      createdAt: now,
      updatedAt: now,
    };

    // Add new note to the beginning of notes array
    notes = [updatedNewNote, ...notes];

    // Save to Redis
    await redis.setex(
      `${NOTES_PREFIX}${userId}`,
      TWO_MONTHS_IN_SECONDS,
      JSON.stringify(notes),
    );

    revalidatePath("/");

    return {
      success: true,
      notes,
    };
  } catch (error) {
    console.error("Failed to add note:", error);
    return {
      success: false,
      error: "Failed to add note",
    };
  }
};

// Update Note Title
export const updateNoteTitle = async (
  userId: string,
  noteId: string,
  title: string,
) => {
  try {
    if (await isBotRequest("note title update")) {
      return {
        success: true,
      };
    }

    if (!title.trim()) {
      return {
        success: false,
        error: "Note title is required",
      };
    }

    const updatedNotes = await updateNoteWithFunction(
      userId,
      noteId,
      (note) => ({
        ...note,
        title: title.trim(),
      }),
    );

    revalidatePath("/");

    return {
      success: true,
      notes: updatedNotes.notes,
    };
  } catch (error) {
    console.error("Failed to update note title:", error);
    return {
      success: false,
      error: "Failed to update note title",
    };
  }
};

// Save Note

// Delete Note

// Update Note Pinned Status

// Update Note Privacy Status

// Update Note Collapsed Status

// Update Note Order
