"use server";

import { Tables } from "../../../database.types";
import { createClient } from "@/utils/supabase/server";
import { CombinedNote } from "@/types/combined-notes";

type SupabaseNote = Tables<"notes">;

// Cache the Supabase client creation
const getSupabase = async () => await createClient();

// Helper function to get authenticated user consistently
async function getAuthenticatedUser() {
  const supabase = await getSupabase();
  const { data: authData, error } = await supabase.auth.getUser();

  if (error || !authData.user?.id) {
    throw new Error("User not authenticated");
  }

  return { supabase, userId: authData.user.id };
}

// Convert CombinedNote to Supabase format
function toSupabaseNote(note: Partial<CombinedNote>): Partial<SupabaseNote> {
  // Validate goal_type before conversion
  const validGoalTypes = ["words", "characters", ""];
  const goalType = validGoalTypes.includes(note.goal_type as any)
    ? note.goal_type
    : "";

  return {
    id: note.id,
    author: note.author,
    title: note.title || "",
    content: note.content || "",
    goal: note.goal || 0,
    goal_type: goalType, // ← Fixed: validated goal_type
    is_pinned: note.isPinned ?? false,
    is_private: note.isPrivate ?? false,
    is_collapsed: note.isCollapsed ?? false,
    order: note.order || 0,
    created_at: note.createdAt
      ? new Date(note.createdAt).toISOString()
      : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// Convert Supabase note to CombinedNote format
function fromSupabaseNote(note: SupabaseNote): CombinedNote {
  // Validate goal_type from database
  const validGoalTypes = ["words", "characters", ""];
  const goalType = validGoalTypes.includes(note.goal_type as any)
    ? (note.goal_type as "words" | "characters" | "")
    : "";

  return {
    id: note.id,
    author: note.author || "",
    title: note.title || "",
    content: note.content || "",
    goal: note.goal || 0,
    goal_type: goalType, // ← Fixed: validated goal_type
    isPinned: note.is_pinned ?? false,
    isPrivate: note.is_private ?? false,
    isCollapsed: note.is_collapsed ?? false,
    order: note.order || 0,
    createdAt: note.created_at
      ? new Date(note.created_at).getTime()
      : Date.now(),
    updatedAt: note.updated_at
      ? new Date(note.updated_at).getTime()
      : Date.now(),
    source: "supabase",
  };
}

// Create Note
export const createNote = async (newNote: Partial<CombinedNote>) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    // Convert to Supabase format
    const supabaseNote = toSupabaseNote(newNote);

    // Ensure author is set
    supabaseNote.author = userId;

    const { data, error } = await supabase
      .from("notes")
      .insert(supabaseNote)
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return {
        success: false,
        error: `Database error: ${error.message}`,
      };
    }

    return {
      success: true,
      note: fromSupabaseNote(data),
    };
  } catch (error) {
    console.error("Exception creating Supabase note:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to add note: ${errorMessage}`,
    };
  }
};

// Update Note
export const updateNote = async (
  noteId: string,
  content: string,
  wordCountGoal: number = 0,
  wordCountGoalType: string = "",
) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const validGoalTypes = ["words", "characters", ""];
    const goalType = validGoalTypes.includes(wordCountGoalType)
      ? wordCountGoalType
      : "";

    const { error } = await supabase
      .from("notes")
      .update({
        content,
        goal: wordCountGoal || 0,
        goal_type: goalType,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (error) {
      console.error("Supabase update error:", error);
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to update note content:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note content: ${errorMessage}`,
    };
  }
};

// Update Note Title
export const updateNoteTitle = async (noteId: string, title: string) => {
  try {
    if (!title?.trim()) {
      return {
        success: false,
        error: "Invalid title: Title cannot be empty",
      };
    }

    const { supabase, userId } = await getAuthenticatedUser();

    const { error } = await supabase
      .from("notes")
      .update({
        title: title.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to update note title:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note title: ${errorMessage}`,
    };
  }
};

// Get Notes By User Id
export const getNotesByUserId = async () => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("author", userId)
      .order("is_pinned", { ascending: false })
      .order("order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase query error:", error);
      throw error;
    }

    // Convert to CombinedNote format
    const notes = data.map(fromSupabaseNote);

    return { success: true, notes };
  } catch (error) {
    console.error("Failed to get notes from Supabase:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to retrieve notes: ${errorMessage}`,
    };
  }
};

// Update Note Pin Status
export const updateNotePinStatus = async (
  noteId: string,
  isPinned: boolean,
) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { error } = await supabase
      .from("notes")
      .update({
        is_pinned: isPinned,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to update note pin status:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note pin status: ${errorMessage}`,
    };
  }
};

// Update Note Privacy Status
export const updateNotePrivacyStatus = async (
  noteId: string,
  isPrivate: boolean,
) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { error } = await supabase
      .from("notes")
      .update({
        is_private: isPrivate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to update note privacy status:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note privacy status: ${errorMessage}`,
    };
  }
};

// Update Note Collapsed Status
export const updateNoteCollapsedStatus = async (
  noteId: string,
  isCollapsed: boolean,
) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { error } = await supabase
      .from("notes")
      .update({
        is_collapsed: isCollapsed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to update note collapsed status:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note collapsed status: ${errorMessage}`,
    };
  }
};

// Update Note Order
export const updateSupabaseNoteOrder = async (
  noteId: string,
  newOrder: number,
) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { error } = await supabase
      .from("notes")
      .update({
        order: newOrder,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to update note order:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note order: ${errorMessage}`,
    };
  }
};

// Delete Note
export const deleteNote = async (noteId: string) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { error } = await supabase
      .from("notes")
      .delete()
      .eq("id", noteId)
      .eq("author", userId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to delete note:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to delete note: ${errorMessage}`,
    };
  }
};

// Batch update note orders for better performance
export const batchUpdateNoteOrders = async (
  updates: { id: string; order: number }[],
) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    // Use a transaction-like approach with Promise.allSettled
    const updatePromises = updates.map(({ id, order }) =>
      supabase
        .from("notes")
        .update({
          order,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("author", userId),
    );

    const results = await Promise.allSettled(updatePromises);

    // Check if any failed
    const failures = results.filter((result) => result.status === "rejected");

    if (failures.length > 0) {
      console.error("Some order updates failed:", failures);
      return {
        success: false,
        error: `${failures.length} order updates failed`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to batch update note orders:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note orders: ${errorMessage}`,
    };
  }
};
