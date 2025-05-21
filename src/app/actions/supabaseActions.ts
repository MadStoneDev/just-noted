"use server";

import { Tables } from "../../../database.types";
import { createClient } from "@/utils/supabase/server";

type SupabaseNote = Tables<`notes`>;
const getSupabase = async () => await createClient();

// Create Note
export const createNote = async (newNote: Partial<SupabaseNote>) => {
  const supabase = await getSupabase();

  try {
    // Explicitly perform an INSERT operation, not an UPSERT
    const { data, error } = await supabase
      .from("notes")
      .insert(newNote)
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", {
        message: error.message,
        details: error.details,
        code: error.code,
      });
      return {
        success: false,
        error: `Database error: ${error.message}`,
      };
    }

    return { success: true, note: data };
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
  userId: string,
  noteId: string,
  content: string,
  wordCountGoal: number,
  wordCountGoalType: string,
) => {
  const supabase = await getSupabase();

  try {
    // Get current auth user to ensure correct ID
    const { data: authData } = await supabase.auth.getUser();
    const authUserId = authData.user?.id;

    // Extra validation - make sure we have a valid user
    if (!authUserId) {
      console.error("Auth user ID missing when updating note");
      return {
        success: false,
        error: "User not authenticated",
      };
    }

    const { error } = await supabase
      .from("notes")
      .update({
        content,
        goal: wordCountGoal || 0,
        goal_type:
          wordCountGoalType === "words" || wordCountGoalType === "characters"
            ? wordCountGoalType
            : "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", authUserId); // Use the authUserId, not the passed userId

    if (error) {
      console.error("Supabase update error:", {
        message: error.message,
        details: error.details,
        code: error.code,
      });
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
export const updateNoteTitle = async (
  userId: string,
  noteId: string,
  title: string,
) => {
  const supabase = await getSupabase();

  try {
    // Get current auth user to ensure correct ID
    const { data: authData } = await supabase.auth.getUser();
    const authUserId = authData.user?.id;

    // Extra validation - make sure we have a valid user
    if (!authUserId) {
      return {
        success: false,
        error: "User not authenticated",
      };
    }

    const { error } = await supabase
      .from("notes")
      .update({
        title,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", authUserId); // Use authUserId instead of passed userId

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
export const getNotesByUserId = async (userId: string) => {
  const supabase = await getSupabase();

  try {
    // Get auth user to ensure correct type
    const { data: authData } = await supabase.auth.getUser();
    const authUserId = authData.user?.id;

    // Use the auth user ID directly (it's already a UUID)
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("author", authUserId) // Use authUserId instead of userId
      .order("is_pinned", { ascending: false })
      .order("order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase query error:", error);
      throw error;
    }

    // Map the database column names to our Note type
    const notes = data.map((item) => ({
      id: item.id as string,
      author: (item.author as string) || "",
      title: (item.title as string) || "",
      content: (item.content as string) || "",
      goal: item.goal || 0,
      goal_type: item.goal_type || "",
      is_private: item.is_private || false,
      is_pinned: item.is_pinned || false,
      is_collapsed: item.is_collapsed || false,
      order: item.order || 0,
    }));

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

// Get Note By Note Id
export const getNoteByNoteId = async (userId: string, noteId: string) => {
  const supabase = await getSupabase();

  try {
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("id", noteId)
      .eq("author", userId);

    if (error) {
      throw error;
    }

    // Map the database column names to our Note type
    const note = data[0];

    if (!note) {
      return {
        success: false,
        error: `Note ${noteId} not found for user ${userId}`,
      };
    }

    return {
      success: true,
      note: {
        id: note.id as string,
        author: (note.author as string) || "",
        title: (note.title as string) || "",
        content: (note.content as string) || "",
        isPrivate: note.is_private || false,
        isPinned: note.is_pinned || false,
        isCollapsed: note.is_collapsed || false,
        order: note.order || 0,
      },
    };
  } catch (error) {
    console.error("Failed to get note from Supabase:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to retrieve note: ${errorMessage}`,
    };
  }
};

// Update Note Pin Status
export const updateNotePinStatus = async (
  userId: string,
  noteId: string,
  isPinned: boolean,
) => {
  const supabase = await getSupabase();

  try {
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
  userId: string,
  noteId: string,
  isPrivate: boolean,
) => {
  const supabase = await getSupabase();

  try {
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
  userId: string,
  noteId: string,
  isCollapsed: boolean,
) => {
  const supabase = await getSupabase();

  try {
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

// Reorder Note

export const reorderNote = async (
  userId: string,
  noteId: string,
  direction: "up" | "down",
) => {
  const supabase = await getSupabase();

  try {
    const { error } = await supabase
      .from("notes")
      .update({
        order: supabase.rpc("swap_note_orders", {
          note_id_1: noteId,
          note_id_2: noteId,
          user_id: userId,
        }),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to reorder note:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to reorder note: ${errorMessage}`,
    };
  }
};

// Delete Note
export const deleteNote = async (userId: string, noteId: string) => {
  const supabase = await getSupabase();

  try {
    // Get current auth user to ensure correct ID
    const { data: authData } = await supabase.auth.getUser();
    const authUserId = authData.user?.id;

    // Extra validation - make sure we have a valid user
    if (!authUserId) {
      return {
        success: false,
        error: "User not authenticated",
      };
    }

    const { error } = await supabase
      .from("notes")
      .delete()
      .eq("id", noteId)
      .eq("author", authUserId); // Use authUserId instead of passed userId

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

export const updateSupabaseNoteOrder = async (
  userId: string | null,
  noteId: string,
  newOrder: number,
) => {
  const supabase = await getSupabase();

  try {
    // Get current auth user to ensure correct ID
    const { data: authData } = await supabase.auth.getUser();
    const authUserId = authData.user?.id;

    // Extra validation - make sure we have a valid user
    if (!authUserId) {
      return {
        success: false,
        error: "User not authenticated",
      };
    }

    const { error } = await supabase
      .from("notes")
      .update({
        order: newOrder,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", authUserId); // Use authUserId instead of passed userId

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
