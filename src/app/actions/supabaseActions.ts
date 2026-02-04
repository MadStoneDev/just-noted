"use server";

import { createClient } from "@/utils/supabase/server";
import {
  CombinedNote,
  combiToSupabase,
  supabaseToCombi,
} from "@/types/combined-notes";
import { validateGoalType, validateNoteTitle } from "@/utils/validation";

// ===========================
// AUTHENTICATION HELPER
// ===========================
async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.getUser();

  if (error || !authData.user?.id) {
    throw new Error("User not authenticated");
  }

  return { supabase, userId: authData.user.id };
}

// ===========================
// NOTE OPERATIONS
// ===========================
export const createNote = async (newNote: Partial<CombinedNote>) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const supabaseNote = combiToSupabase({
      ...newNote,
      author: userId,
      goal_type: validateGoalType(newNote.goal_type),
    } as CombinedNote);

    const { data, error } = await supabase
      .from("notes")
      .insert(supabaseNote)
      .select()
      .single();

    if (error) {
      console.error("Failed to create note");
      return {
        success: false,
        error: "Failed to save note to database",
      };
    }

    return {
      success: true,
      note: supabaseToCombi(data),
    };
  } catch (error) {
    console.error("Exception creating note");
    return {
      success: false,
      error: "Failed to add note",
    };
  }
};

export const updateNote = async (
  noteId: string,
  content: string,
  wordCountGoal: number = 0,
  wordCountGoalType: string = "",
) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { error } = await supabase
      .from("notes")
      .update({
        content,
        goal: wordCountGoal || 0,
        goal_type: validateGoalType(wordCountGoalType),
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
    console.error("Failed to update note:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note: ${errorMessage}`,
    };
  }
};

export const updateNoteTitle = async (noteId: string, title: string) => {
  try {
    if (!validateNoteTitle(title)) {
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

    if (error) throw error;

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

    const notes = data.map(supabaseToCombi);

    return { success: true, notes };
  } catch (error) {
    console.error("Failed to get notes:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to retrieve notes: ${errorMessage}`,
    };
  }
};

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

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Failed to update pin status:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update pin status: ${errorMessage}`,
    };
  }
};

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

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Failed to update privacy status:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update privacy status: ${errorMessage}`,
    };
  }
};

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

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Failed to update collapsed status:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update collapsed status: ${errorMessage}`,
    };
  }
};

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

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Failed to update order:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update order: ${errorMessage}`,
    };
  }
};

export const deleteNote = async (noteId: string) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { error } = await supabase
      .from("notes")
      .delete()
      .eq("id", noteId)
      .eq("author", userId);

    if (error) throw error;

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

export const batchUpdateNoteOrders = async (
  updates: { id: string; order: number }[],
) => {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

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
    console.error("Failed to batch update orders:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update orders: ${errorMessage}`,
    };
  }
};
