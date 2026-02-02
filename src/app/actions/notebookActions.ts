"use server";

import { createClient } from "@/utils/supabase/server";
import {
  Notebook,
  NotebookRow,
  CreateNotebookInput,
  UpdateNotebookInput,
  notebookRowToNotebook,
  NOTEBOOK_LIMITS,
} from "@/types/notebook";
import {
  DEFAULT_COVER_TYPE,
  DEFAULT_COVER_VALUE,
} from "@/lib/notebook-covers";

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
// NOTEBOOK OPERATIONS
// ===========================

export async function getNotebooks(): Promise<{
  success: boolean;
  notebooks?: Notebook[];
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { data, error } = await supabase
      .from("notebooks")
      .select("*")
      .eq("owner", userId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch notebooks:", error);
      return {
        success: false,
        error: `Database error: ${error.message}`,
      };
    }

    const notebooks = (data as NotebookRow[]).map(notebookRowToNotebook);

    return { success: true, notebooks };
  } catch (error) {
    console.error("Failed to get notebooks:", error);
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to retrieve notebooks: ${errorMessage}`,
    };
  }
}

export async function createNotebook(
  input: CreateNotebookInput,
): Promise<{
  success: boolean;
  notebook?: Notebook;
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    // Check notebook limit
    const { count, error: countError } = await supabase
      .from("notebooks")
      .select("*", { count: "exact", head: true })
      .eq("owner", userId);

    if (countError) {
      console.error("Failed to count notebooks:", countError);
      return {
        success: false,
        error: `Database error: ${countError.message}`,
      };
    }

    const currentCount = count || 0;
    // TODO: Check user's subscription tier for limit
    const limit = NOTEBOOK_LIMITS.free;

    if (currentCount >= limit) {
      return {
        success: false,
        error: `You've reached the maximum of ${limit} notebooks. Upgrade to premium for more.`,
      };
    }

    // Get the next display order
    const { data: maxOrderData } = await supabase
      .from("notebooks")
      .select("display_order")
      .eq("owner", userId)
      .order("display_order", { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxOrderData?.display_order ?? -1) + 1;

    // Validate and set defaults
    const name = input.name?.trim();
    if (!name) {
      return {
        success: false,
        error: "Notebook name is required",
      };
    }

    const coverType = input.coverType || DEFAULT_COVER_TYPE;
    const coverValue = input.coverValue || DEFAULT_COVER_VALUE;

    const { data, error } = await supabase
      .from("notebooks")
      .insert({
        owner: userId,
        name,
        cover_type: coverType,
        cover_value: coverValue,
        display_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create notebook:", error);
      return {
        success: false,
        error: `Database error: ${error.message}`,
      };
    }

    return {
      success: true,
      notebook: notebookRowToNotebook(data as NotebookRow),
    };
  } catch (error) {
    console.error("Failed to create notebook:", error);
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to create notebook: ${errorMessage}`,
    };
  }
}

export async function updateNotebook(
  id: string,
  updates: UpdateNotebookInput,
): Promise<{
  success: boolean;
  notebook?: Notebook;
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) {
      const name = updates.name.trim();
      if (!name) {
        return {
          success: false,
          error: "Notebook name cannot be empty",
        };
      }
      updateData.name = name;
    }

    if (updates.coverType !== undefined) {
      updateData.cover_type = updates.coverType;
    }

    if (updates.coverValue !== undefined) {
      updateData.cover_value = updates.coverValue;
    }

    if (updates.displayOrder !== undefined) {
      updateData.display_order = updates.displayOrder;
    }

    const { data, error } = await supabase
      .from("notebooks")
      .update(updateData)
      .eq("id", id)
      .eq("owner", userId)
      .select()
      .single();

    if (error) {
      console.error("Failed to update notebook:", error);
      return {
        success: false,
        error: `Database error: ${error.message}`,
      };
    }

    return {
      success: true,
      notebook: notebookRowToNotebook(data as NotebookRow),
    };
  } catch (error) {
    console.error("Failed to update notebook:", error);
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update notebook: ${errorMessage}`,
    };
  }
}

export async function deleteNotebook(id: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    // Notes with this notebook_id will be set to NULL via ON DELETE SET NULL
    const { error } = await supabase
      .from("notebooks")
      .delete()
      .eq("id", id)
      .eq("owner", userId);

    if (error) {
      console.error("Failed to delete notebook:", error);
      return {
        success: false,
        error: `Database error: ${error.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to delete notebook:", error);
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to delete notebook: ${errorMessage}`,
    };
  }
}

export async function reorderNotebooks(
  updates: { id: string; order: number }[],
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const updatePromises = updates.map(({ id, order }) =>
      supabase
        .from("notebooks")
        .update({
          display_order: order,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("owner", userId),
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
    console.error("Failed to reorder notebooks:", error);
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to reorder notebooks: ${errorMessage}`,
    };
  }
}

// ===========================
// NOTE-NOTEBOOK ASSIGNMENT
// ===========================

export async function assignNoteToNotebook(
  noteId: string,
  notebookId: string | null,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    // If assigning to a notebook, verify the user owns it
    if (notebookId) {
      const { data: notebook, error: notebookError } = await supabase
        .from("notebooks")
        .select("id")
        .eq("id", notebookId)
        .eq("owner", userId)
        .single();

      if (notebookError || !notebook) {
        return {
          success: false,
          error: "Notebook not found or access denied",
        };
      }
    }

    const { error } = await supabase
      .from("notes")
      .update({
        notebook_id: notebookId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (error) {
      console.error("Failed to assign note to notebook:", error);
      return {
        success: false,
        error: `Database error: ${error.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to assign note to notebook:", error);
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to assign note to notebook: ${errorMessage}`,
    };
  }
}

// ===========================
// BULK NOTE ASSIGNMENT
// ===========================

export async function bulkAssignNotesToNotebook(
  noteIds: string[],
  notebookId: string | null,
): Promise<{
  success: boolean;
  updatedCount?: number;
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    // If assigning to a notebook, verify the user owns it
    if (notebookId) {
      const { data: notebook, error: notebookError } = await supabase
        .from("notebooks")
        .select("id")
        .eq("id", notebookId)
        .eq("owner", userId)
        .single();

      if (notebookError || !notebook) {
        return {
          success: false,
          error: "Notebook not found or access denied",
        };
      }
    }

    // Update all notes
    const { data, error } = await supabase
      .from("notes")
      .update({
        notebook_id: notebookId,
        updated_at: new Date().toISOString(),
      })
      .eq("author", userId)
      .in("id", noteIds)
      .select("id");

    if (error) {
      console.error("Failed to bulk assign notes:", error);
      return {
        success: false,
        error: `Database error: ${error.message}`,
      };
    }

    return {
      success: true,
      updatedCount: data?.length || 0,
    };
  } catch (error) {
    console.error("Failed to bulk assign notes:", error);
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to assign notes: ${errorMessage}`,
    };
  }
}

// ===========================
// NOTEBOOK STATS
// ===========================

export async function getNotebookNoteCounts(): Promise<{
  success: boolean;
  counts?: Record<string, number>;
  looseCount?: number;
  error?: string;
}> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    // Get all notes with their notebook_id
    const { data, error } = await supabase
      .from("notes")
      .select("notebook_id")
      .eq("author", userId);

    if (error) {
      console.error("Failed to get note counts:", error);
      return {
        success: false,
        error: `Database error: ${error.message}`,
      };
    }

    // Count notes per notebook
    const counts: Record<string, number> = {};
    let looseCount = 0;

    for (const note of data) {
      if (note.notebook_id) {
        counts[note.notebook_id] = (counts[note.notebook_id] || 0) + 1;
      } else {
        looseCount++;
      }
    }

    return { success: true, counts, looseCount };
  } catch (error) {
    console.error("Failed to get notebook note counts:", error);
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to get counts: ${errorMessage}`,
    };
  }
}
