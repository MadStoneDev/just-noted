"use server";

import redis from "@/utils/redis";
import { revalidatePath } from "next/cache";

import { Note } from "@/types/notes";
import { incrementGlobalNoteCount } from "./counterActions";

async function isBotRequest(action: string): Promise<boolean> {
  try {
    const { headers } = require("next/headers");

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
  } catch (error) {
    console.error(`Error in isBotRequest for ${action}:`, error);
    return false;
  }
}

async function updateNoteProperty(
  userId: string,
  noteId: string,
  updateFn: (note: Note) => Note,
) {
  const transaction = redis.multi();

  transaction.get(`notes:${userId}`);
  const results = await transaction.exec();

  if (!results || !results[0]) {
    throw new Error(`Failed to get notes for user ${userId}`);
  }

  const currentNotes = (results[0] as Note[]) || [];
  const noteIndex = currentNotes.findIndex((note) => note.id === noteId);

  if (noteIndex === -1) {
    throw new Error(`Note ${noteId} not found for user ${userId}`);
  }

  const updatedNotes = [
    ...currentNotes.slice(0, noteIndex),

    updateFn(currentNotes[noteIndex]),
    ...currentNotes.slice(noteIndex + 1),
  ];

  await redis.set(`notes:${userId}`, updatedNotes);
  return updatedNotes;
}

export async function deleteNoteAction(userId: string, noteId: string) {
  try {
    if (await isBotRequest("note delete")) {
      return {
        success: true,
      };
    }

    const { isUserIdActive, registerUserId, refreshUserActivity } =
      await import("@/utils/userIdManagement");

    const isActive = await isUserIdActive(userId);

    if (!isActive) {
      await registerUserId(userId);
    } else {
      await refreshUserActivity(userId);
    }

    const transaction = redis.multi();
    transaction.get(`notes:${userId}`);
    const results = await transaction.exec();

    if (!results || !results[0]) {
      return {
        success: false,
        error: `Failed to get notes for user ${userId}`,
      };
    }

    const currentNotes = (results[0] as Note[]) || [];

    const noteToDelete = currentNotes.find((note) => note.id === noteId);
    if (!noteToDelete) {
      return {
        success: false,
        error: `Note with ID ${noteId} not found for user ${userId}`,
      };
    }

    const updatedNotes = currentNotes.filter((note) => note.id !== noteId);

    await redis.set(`notes:${userId}`, updatedNotes);

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
) {
  try {
    if (await isBotRequest("note update")) {
      return {
        success: true,
      };
    }

    if (!userId) {
      return {
        success: false,
        error: "Invalid user ID: User ID cannot be empty",
      };
    }

    // Validate the user ID and ensure it's registered
    const { isUserIdActive, registerUserId, refreshUserActivity } =
      await import("@/utils/userIdManagement");

    const isActive = await isUserIdActive(userId);
    if (!isActive) {
      await registerUserId(userId);
    } else {
      await refreshUserActivity(userId);
    }

    try {
      // Try to update the note property
      const updatedNotes = await updateNoteProperty(userId, noteId, (note) => ({
        ...note,
        content,
        updatedAt: Date.now(),
      }));

      revalidatePath("/");
      return {
        success: true,
        notes: updatedNotes,
      };
    } catch (error) {
      // If the update fails, it might be because the note doesn't exist
      // Let's check if it's because the note wasn't found
      if (error instanceof Error && error.message.includes("not found")) {
        // Create a new note with this ID
        console.log(
          `Note ${noteId} not found for user ${userId}, creating new note`,
        );

        // Get existing notes to add the new note
        let currentNotes: Note[] = [];
        try {
          currentNotes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];
        } catch (e) {
          // If no notes exist yet, use an empty array
          console.log(
            `No existing notes for user ${userId}, creating new record`,
          );
        }

        // Create a new note
        const noteNumber = await incrementGlobalNoteCount();
        const newNote: Note = {
          id: noteId,
          title: `Just Noted #${noteNumber}`,
          content,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        // Add to beginning of notes array
        const updatedNotes = [newNote, ...currentNotes];

        // Save to Redis
        await redis.set(`notes:${userId}`, updatedNotes);

        revalidatePath("/");
        return {
          success: true,
          notes: updatedNotes,
        };
      }

      // Re-throw for other types of errors
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
    if (!userId) {
      return {
        success: false,
        error: "Invalid user ID: User ID cannot be empty",
      };
    }

    const notes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];
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

export async function addNoteAction(userId: string, newNote: Note) {
  try {
    if (await isBotRequest("note add")) {
      return {
        success: true,
      };
    }

    if (!userId) {
      return {
        success: false,
        error: "Invalid user ID: User ID cannot be empty",
      };
    }

    if (!newNote || !newNote.id) {
      return {
        success: false,
        error: "Invalid note data: Note must have an ID",
      };
    }

    const { isUserIdActive, registerUserId, refreshUserActivity } =
      await import("@/utils/userIdManagement");

    const isActive = await isUserIdActive(userId);

    if (!isActive) {
      await registerUserId(userId);
    } else {
      await refreshUserActivity(userId);
    }

    const noteNumber = await incrementGlobalNoteCount();

    const now = Date.now();
    const noteWithTimestamps = {
      ...newNote,
      title:
        newNote.title === "Just Noted"
          ? `Just Noted #${noteNumber}`
          : newNote.title,
      createdAt: now,
      updatedAt: now,
    };

    const transaction = redis.multi();
    transaction.get(`notes:${userId}`);
    const results = await transaction.exec();

    let currentNotes: Note[] = [];
    if (results && results[0]) {
      currentNotes = (results[0] as Note[]) || [];
    } else {
      console.log(`No existing notes for user ${userId}, creating new record`);
    }

    const updatedNotes = [noteWithTimestamps, ...currentNotes];

    await redis.set(`notes:${userId}`, updatedNotes);

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
      return {
        success: true,
      };
    }

    if (!title.trim()) {
      return {
        success: false,
        error: "Invalid title: Title cannot be empty",
      };
    }

    const { isUserIdActive, registerUserId, refreshUserActivity } =
      await import("@/utils/userIdManagement");

    const isActive = await isUserIdActive(userId);

    if (!isActive) {
      await registerUserId(userId);
    } else {
      await refreshUserActivity(userId);
    }

    // Update the note title
    const updatedNotes = await updateNoteProperty(userId, noteId, (note) => ({
      ...note,
      title,
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
      return {
        success: true,
      };
    }

    const { isUserIdActive, registerUserId, refreshUserActivity } =
      await import("@/utils/userIdManagement");

    const isActive = await isUserIdActive(userId);

    if (!isActive) {
      await registerUserId(userId);
    } else {
      await refreshUserActivity(userId);
    }

    // Update the note with the new pin status
    const updatedNotes = await updateNoteProperty(userId, noteId, (note) => ({
      ...note,
      pinned,
      updatedAt: Date.now(),
      // Preserve original createdAt or use updatedAt as fallback
      createdAt: note.createdAt || note.updatedAt || Date.now(),
    }));

    // Sort notes by pin status and order for consistent order
    const sortedNotes = sortNotesByPinStatus(updatedNotes);

    // Save sorted notes back to Redis
    await redis.set(`notes:${userId}`, sortedNotes);

    // Force revalidation
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

export async function reorderNoteAction(
  userId: string,
  noteId: string,
  direction: "up" | "down",
) {
  try {
    if (await isBotRequest("note reorder")) {
      return {
        success: true,
      };
    }

    const { isUserIdActive, registerUserId, refreshUserActivity } =
      await import("@/utils/userIdManagement");

    const isActive = await isUserIdActive(userId);

    if (!isActive) {
      await registerUserId(userId);
    } else {
      await refreshUserActivity(userId);
    }

    const transaction = redis.multi();
    transaction.get(`notes:${userId}`);
    const results = await transaction.exec();

    if (!results || !results[0]) {
      return {
        success: false,
        error: `Failed to get notes for user ${userId}`,
      };
    }

    const currentNotes = (results[0] as Note[]) || [];

    const noteIndex = currentNotes.findIndex((note) => note.id === noteId);

    if (noteIndex === -1) {
      return {
        success: false,
        error: `Note with ID ${noteId} not found for user ${userId}`,
      };
    }

    const currentNote = currentNotes[noteIndex];

    const pinnedNotes = currentNotes.filter((note) => note.pinned);
    const unpinnedNotes = currentNotes.filter((note) => !note.pinned);

    let updatedPinnedNotes: Note[] = [...pinnedNotes];
    let updatedUnpinnedNotes: Note[] = [...unpinnedNotes];

    if (currentNote.pinned) {
      const pinnedIndex = pinnedNotes.findIndex((note) => note.id === noteId);

      if (direction === "up" && pinnedIndex > 0) {
        updatedPinnedNotes = [
          ...pinnedNotes.slice(0, pinnedIndex - 1),
          pinnedNotes[pinnedIndex],
          pinnedNotes[pinnedIndex - 1],
          ...pinnedNotes.slice(pinnedIndex + 1),
        ];
      } else if (direction === "down" && pinnedIndex < pinnedNotes.length - 1) {
        updatedPinnedNotes = [
          ...pinnedNotes.slice(0, pinnedIndex),
          pinnedNotes[pinnedIndex + 1],
          pinnedNotes[pinnedIndex],
          ...pinnedNotes.slice(pinnedIndex + 2),
        ];
      }

      updatedPinnedNotes = updatedPinnedNotes.map((note, index) => ({
        ...note,
        order: index,
      }));
    } else {
      const unpinnedIndex = unpinnedNotes.findIndex(
        (note) => note.id === noteId,
      );

      if (direction === "up" && unpinnedIndex > 0) {
        updatedUnpinnedNotes = [
          ...unpinnedNotes.slice(0, unpinnedIndex - 1),
          unpinnedNotes[unpinnedIndex],
          unpinnedNotes[unpinnedIndex - 1],
          ...unpinnedNotes.slice(unpinnedIndex + 1),
        ];
      } else if (
        direction === "down" &&
        unpinnedIndex < unpinnedNotes.length - 1
      ) {
        updatedUnpinnedNotes = [
          ...unpinnedNotes.slice(0, unpinnedIndex),
          unpinnedNotes[unpinnedIndex + 1],
          unpinnedNotes[unpinnedIndex],
          ...unpinnedNotes.slice(unpinnedIndex + 2),
        ];
      }

      const pinnedCount = updatedPinnedNotes.length;
      updatedUnpinnedNotes = updatedUnpinnedNotes.map((note, index) => ({
        ...note,
        order: pinnedCount + index,
      }));
    }

    const finalUpdatedNotes = [...updatedPinnedNotes, ...updatedUnpinnedNotes];

    await redis.set(`notes:${userId}`, finalUpdatedNotes);

    revalidatePath("/");
    return {
      success: true,
      notes: finalUpdatedNotes,
    };
  } catch (error) {
    console.error("Failed to reorder note:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to reorder note: ${errorMessage}`,
    };
  }
}

function sortNotesByPinStatus(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    // First sort by pin status (pinned notes first)
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    // If both notes have order values, use them for sorting
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }

    // For pinned notes without order, sort by updatedAt (most recent first)
    if (a.pinned && b.pinned) {
      const aTime = a.updatedAt || 0;
      const bTime = b.updatedAt || 0;
      return bTime - aTime;
    }

    // For unpinned notes without order, sort by createdAt (most recent first)
    const aCreate = a.createdAt || 0;
    const bCreate = b.createdAt || 0;
    return bCreate - aCreate;
  });
}

export async function updateNotePrivacyStatusAction(
  userId: string,
  noteId: string,
  isPrivate: boolean,
) {
  try {
    if (await isBotRequest("note privacy update")) {
      return {
        success: true,
      };
    }

    const { isUserIdActive, registerUserId, refreshUserActivity } =
      await import("@/utils/userIdManagement");

    const isActive = await isUserIdActive(userId);

    if (!isActive) {
      await registerUserId(userId);
    } else {
      await refreshUserActivity(userId);
    }

    // Update the note with the new privacy status
    const updatedNotes = await updateNoteProperty(userId, noteId, (note) => ({
      ...note,
      isPrivate,
      updatedAt: Date.now(),
    }));

    // Force revalidation
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
      return {
        success: true,
      };
    }

    const { isUserIdActive, registerUserId, refreshUserActivity } =
      await import("@/utils/userIdManagement");

    const isActive = await isUserIdActive(userId);

    if (!isActive) {
      await registerUserId(userId);
    } else {
      await refreshUserActivity(userId);
    }

    // Update the note with the new collapsed status
    const updatedNotes = await updateNoteProperty(userId, noteId, (note) => ({
      ...note,
      isCollapsed,
      updatedAt: Date.now(),
    }));

    // Force revalidation
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
  userId: string | null,
  noteId: string,
  newOrder: number,
) {
  try {
    if (await isBotRequest("note order update")) {
      return {
        success: true,
      };
    }

    if (!userId) {
      return {
        success: false,
        error: "Invalid user ID: User ID cannot be empty",
      };
    }

    const { isUserIdActive, registerUserId, refreshUserActivity } =
      await import("@/utils/userIdManagement");

    const isActive = await isUserIdActive(userId);

    if (!isActive) {
      await registerUserId(userId);
    } else {
      await refreshUserActivity(userId);
    }

    // Update the note with the new order
    const updatedNotes = await updateNoteProperty(userId, noteId, (note) => ({
      ...note,
      order: newOrder,
      updatedAt: Date.now(),
    }));

    // Force revalidation
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
