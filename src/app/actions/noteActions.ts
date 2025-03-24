"use server";

import { revalidatePath } from "next/cache";

import redis from "@/utils/redis";
import { Note } from "@/types/notes";

export async function saveNotesAction(userId: string, notes: Note[]) {
  try {
    await redis.set(`notes:${userId}`, notes);
    revalidatePath("/notes"); // Adjust path as needed
    return { success: true };
  } catch (error) {
    console.error("Failed to save notes:", error);
    return { success: false, error: "Failed to save notes" };
  }
}

export async function deleteNoteAction(userId: string, noteId: string) {
  try {
    // Get current notes
    const currentNotes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];

    // Filter out the deleted note
    const updatedNotes = currentNotes.filter((note) => note.id !== noteId);

    // Save the updated notes
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
    // Get current notes
    const currentNotes = ((await redis.get(`notes:${userId}`)) as Note[]) || [];

    // Find the note to update
    const noteIndex = currentNotes.findIndex((note) => note.id === noteId);

    if (noteIndex === -1) {
      throw new Error(`Note with ID ${noteId} not found`);
    }

    // Update the note content
    const updatedNotes = [...currentNotes];
    updatedNotes[noteIndex] = {
      ...updatedNotes[noteIndex],
      content,
    };

    // Save back to Redis
    await redis.set(`notes:${userId}`, updatedNotes);

    // Force revalidation
    revalidatePath("/notes"); // Adjust path as needed

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

    const updatedNotes = [newNote, ...currentNotes];

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
      note.id === noteId ? { ...note, title } : note,
    );

    await redis.set(`notes:${userId}`, updatedNotes);

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Failed to update note title:", error);
    return { success: false, error: "Failed to update note title" };
  }
}
