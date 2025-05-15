"use server";

import { createClient } from "@/utils/supabase/server";
import { Note } from "@/types/notes";
import { revalidatePath } from "next/cache";

/**
 * Get all notes for the authenticated user from Supabase
 */
export async function getSupabaseNotes(userId: string) {
  try {
    const supabase = await createClient();

    // Verify this is an authenticated user
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user || userData.user.id !== userId) {
      return {
        success: false,
        error: "Unauthorized: User is not authenticated or ID mismatch",
      };
    }

    // Get all notes for this user, ordered by pin status and order
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("author", userId)
      .order("is_pinned", { ascending: false }) // Pinned notes first
      .order("order", { ascending: true }) // Then by order
      .order("created_at", { ascending: false }); // Then by creation date (newest first)

    if (error) {
      throw error;
    }

    // Map the database column names to our Note type
    const notes: Note[] = data.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      createdAt: new Date(item.created_at).getTime(),
      updatedAt: new Date(item.updated_at).getTime(),
      pinned: item.is_pinned,
      isPrivate: item.is_private,
      isCollapsed: item.is_collapsed,
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
}

/**
 * Add a new note to Supabase
 */
export async function addSupabaseNoteAction(userId: string, newNote: Note) {
  try {
    const supabase = await createClient();

    // Verify this is an authenticated user
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user || userData.user.id !== userId) {
      return {
        success: false,
        error: "Unauthorized: User is not authenticated or ID mismatch",
      };
    }

    // Get the existing notes to determine the order
    const { data: existingNotes, error: notesError } = await supabase
      .from("notes")
      .select("order")
      .eq("author", userId)
      .eq("is_pinned", newNote.pinned || false)
      .order("order", { ascending: false }) // Get highest order first
      .limit(1);

    if (notesError) {
      throw notesError;
    }

    // Determine the order value for the new note
    let order = 0;
    if (
      existingNotes &&
      existingNotes.length > 0 &&
      existingNotes[0].order !== null
    ) {
      order = (existingNotes[0].order || 0) + 1;
    }

    // Prepare the note data for insertion
    const noteData = {
      id: newNote.id,
      author: userId,
      title: newNote.title,
      content: newNote.content || "",
      created_at: new Date(newNote.createdAt || Date.now()).toISOString(),
      updated_at: new Date(newNote.updatedAt || Date.now()).toISOString(),
      is_pinned: newNote.pinned || false,
      is_private: newNote.isPrivate || false,
      is_collapsed: newNote.isCollapsed || false,
      order: order,
    };

    // Insert the new note
    const { error: insertError } = await supabase
      .from("notes")
      .insert(noteData);

    if (insertError) {
      throw insertError;
    }

    // Get the updated list of notes
    const { success, notes, error } = await getSupabaseNotes(userId);

    if (!success) {
      throw new Error(error);
    }

    revalidatePath("/");
    return { success: true, notes };
  } catch (error) {
    console.error("Failed to add note to Supabase:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to add note: ${errorMessage}`,
    };
  }
}

/**
 * Update a note's content in Supabase
 */
export async function updateSupabaseNoteAction(
  userId: string,
  noteId: string,
  content: string,
) {
  try {
    const supabase = await createClient();

    // Verify this is an authenticated user
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user || userData.user.id !== userId) {
      return {
        success: false,
        error: "Unauthorized: User is not authenticated or ID mismatch",
      };
    }

    // Update the note content
    const { error: updateError } = await supabase
      .from("notes")
      .update({
        content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (updateError) {
      throw updateError;
    }

    // Get the updated list of notes
    const { success, notes, error } = await getSupabaseNotes(userId);

    if (!success) {
      throw new Error(error);
    }

    revalidatePath("/");
    return { success: true, notes };
  } catch (error) {
    console.error("Failed to update note in Supabase:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note content: ${errorMessage}`,
    };
  }
}

/**
 * Update a note's title in Supabase
 */
export async function updateSupabaseNoteTitleAction(
  userId: string,
  noteId: string,
  title: string,
) {
  try {
    const supabase = await createClient();

    // Verify this is an authenticated user
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user || userData.user.id !== userId) {
      return {
        success: false,
        error: "Unauthorized: User is not authenticated or ID mismatch",
      };
    }

    // Update the note title
    const { error: updateError } = await supabase
      .from("notes")
      .update({
        title,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (updateError) {
      throw updateError;
    }

    // Get the updated list of notes
    const { success, notes, error } = await getSupabaseNotes(userId);

    if (!success) {
      throw new Error(error);
    }

    revalidatePath("/");
    return { success: true, notes };
  } catch (error) {
    console.error("Failed to update note title in Supabase:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note title: ${errorMessage}`,
    };
  }
}

/**
 * Update a note's pin status in Supabase
 */
export async function updateSupabaseNotePinStatusAction(
  userId: string,
  noteId: string,
  pinned: boolean,
) {
  try {
    const supabase = await createClient();

    // Verify this is an authenticated user
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user || userData.user.id !== userId) {
      return {
        success: false,
        error: "Unauthorized: User is not authenticated or ID mismatch",
      };
    }

    // Get all notes to determine the new order
    const { data: notes, error: notesError } = await supabase
      .from("notes")
      .select("id, is_pinned, order")
      .eq("author", userId)
      .order("order", { ascending: true });

    if (notesError) {
      throw notesError;
    }

    // Find the current note
    const currentNote = notes.find((note) => note.id === noteId);
    if (!currentNote) {
      throw new Error(`Note ${noteId} not found`);
    }

    // If pin status is changing, we need to adjust the order
    let newOrder = currentNote.order;
    if (currentNote.is_pinned !== pinned) {
      if (pinned) {
        // If pinning, find the highest order among pinned notes
        const pinnedNotes = notes.filter((note) => note.is_pinned);
        newOrder =
          pinnedNotes.length > 0
            ? Math.max(...pinnedNotes.map((note) => note.order || 0)) + 1
            : 0;
      } else {
        // If unpinning, find the highest order among unpinned notes
        const unpinnedNotes = notes.filter((note) => !note.is_pinned);
        newOrder =
          unpinnedNotes.length > 0
            ? Math.max(...unpinnedNotes.map((note) => note.order || 0)) + 1
            : 0;
      }
    }

    // Update the note pin status and order
    const { error: updateError } = await supabase
      .from("notes")
      .update({
        is_pinned: pinned,
        order: newOrder,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (updateError) {
      throw updateError;
    }

    // Get the updated list of notes
    const {
      success,
      notes: updatedNotes,
      error,
    } = await getSupabaseNotes(userId);

    if (!success) {
      throw new Error(error);
    }

    revalidatePath("/");
    return { success: true, notes: updatedNotes };
  } catch (error) {
    console.error("Failed to update note pin status in Supabase:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note pin status: ${errorMessage}`,
    };
  }
}

/**
 * Update a note's privacy status in Supabase
 */
export async function updateSupabaseNotePrivacyStatusAction(
  userId: string,
  noteId: string,
  isPrivate: boolean,
) {
  try {
    const supabase = await createClient();

    // Verify this is an authenticated user
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user || userData.user.id !== userId) {
      return {
        success: false,
        error: "Unauthorized: User is not authenticated or ID mismatch",
      };
    }

    // Update the note privacy status
    const { error: updateError } = await supabase
      .from("notes")
      .update({
        is_private: isPrivate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (updateError) {
      throw updateError;
    }

    // Get the updated list of notes
    const { success, notes, error } = await getSupabaseNotes(userId);

    if (!success) {
      throw new Error(error);
    }

    revalidatePath("/");
    return { success: true, notes };
  } catch (error) {
    console.error("Failed to update note privacy status in Supabase:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note privacy status: ${errorMessage}`,
    };
  }
}

/**
 * Update a note's collapsed status in Supabase
 */
export async function updateSupabaseNoteCollapsedStatusAction(
  userId: string,
  noteId: string,
  isCollapsed: boolean,
) {
  try {
    const supabase = await createClient();

    // Verify this is an authenticated user
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user || userData.user.id !== userId) {
      return {
        success: false,
        error: "Unauthorized: User is not authenticated or ID mismatch",
      };
    }

    // Update the note collapsed status
    const { error: updateError } = await supabase
      .from("notes")
      .update({
        is_collapsed: isCollapsed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("author", userId);

    if (updateError) {
      throw updateError;
    }

    // Get the updated list of notes
    const { success, notes, error } = await getSupabaseNotes(userId);

    if (!success) {
      throw new Error(error);
    }

    revalidatePath("/");
    return { success: true, notes };
  } catch (error) {
    console.error("Failed to update note collapsed status in Supabase:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to update note collapsed status: ${errorMessage}`,
    };
  }
}

/**
 * Delete a note from Supabase
 */
export async function deleteSupabaseNoteAction(userId: string, noteId: string) {
  try {
    const supabase = await createClient();

    // Verify this is an authenticated user
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user || userData.user.id !== userId) {
      return {
        success: false,
        error: "Unauthorized: User is not authenticated or ID mismatch",
      };
    }

    // Delete the note
    const { error: deleteError } = await supabase
      .from("notes")
      .delete()
      .eq("id", noteId)
      .eq("author", userId);

    if (deleteError) {
      throw deleteError;
    }

    // Get the updated list of notes
    const { success, notes, error } = await getSupabaseNotes(userId);

    if (!success) {
      throw new Error(error);
    }

    revalidatePath("/");
    return { success: true, notes };
  } catch (error) {
    console.error("Failed to delete note from Supabase:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to delete note: ${errorMessage}`,
    };
  }
}

/**
 * Reorder a note in Supabase
 */
export async function reorderSupabaseNoteAction(
  userId: string,
  noteId: string,
  direction: "up" | "down",
) {
  try {
    const supabase = await createClient();

    // Verify this is an authenticated user
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user || userData.user.id !== userId) {
      return {
        success: false,
        error: "Unauthorized: User is not authenticated or ID mismatch",
      };
    }

    // Get all notes for this user to find adjacents
    const { data: notes, error: notesError } = await supabase
      .from("notes")
      .select("id, is_pinned, order")
      .eq("author", userId)
      .order("is_pinned", { ascending: false }) // Pinned notes first
      .order("order", { ascending: true }); // Then by order

    if (notesError) {
      throw notesError;
    }

    // Find the note we want to reorder
    const noteToReorder = notes.find((note) => note.id === noteId);
    if (!noteToReorder) {
      return {
        success: false,
        error: `Note ${noteId} not found`,
      };
    }

    // Get all notes with the same pin status
    const sameStatusNotes = notes.filter(
      (note) => note.is_pinned === noteToReorder.is_pinned,
    );

    // Find the current note's position in its group
    const noteIndexInGroup = sameStatusNotes.findIndex(
      (note) => note.id === noteId,
    );

    // Find the adjacent note to swap with based on direction
    let adjacentNote = null;
    if (direction === "up" && noteIndexInGroup > 0) {
      // Moving up - find previous note in same group
      adjacentNote = sameStatusNotes[noteIndexInGroup - 1];
    } else if (
      direction === "down" &&
      noteIndexInGroup < sameStatusNotes.length - 1
    ) {
      // Moving down - find next note in same group
      adjacentNote = sameStatusNotes[noteIndexInGroup + 1];
    }

    // If no adjacent note was found, nothing to do
    if (!adjacentNote) {
      return {
        success: true,
        notes: await getSupabaseNotes(userId).then((res) => res.notes || []),
      };
    }

    // Swap orders between the two notes
    const tempOrder = noteToReorder.order;

    // Update in a transaction
    const { error: updateError } = await supabase.rpc("swap_note_orders", {
      note_id_1: noteToReorder.id,
      note_id_2: adjacentNote.id,
      user_id: userId,
    });

    if (updateError) {
      console.error("Error swapping note orders:", updateError);

      // Fallback if the RPC function isn't available
      if (
        updateError.message.includes("function") &&
        updateError.message.includes("does not exist")
      ) {
        // Perform the updates manually as separate operations
        const { error: update1 } = await supabase
          .from("notes")
          .update({
            order: adjacentNote.order,
            updated_at: new Date().toISOString(),
          })
          .eq("id", noteToReorder.id)
          .eq("author", userId);

        if (update1) throw update1;

        const { error: update2 } = await supabase
          .from("notes")
          .update({
            order: tempOrder,
            updated_at: new Date().toISOString(),
          })
          .eq("id", adjacentNote.id)
          .eq("author", userId);

        if (update2) throw update2;
      } else {
        throw updateError;
      }
    }

    // Get the updated list of notes
    const {
      success,
      notes: updatedNotes,
      error,
    } = await getSupabaseNotes(userId);

    if (!success) {
      throw new Error(error);
    }

    revalidatePath("/");
    return { success: true, notes: updatedNotes };
  } catch (error) {
    console.error("Failed to reorder note in Supabase:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to reorder note: ${errorMessage}`,
    };
  }
}

/**
 * Helper function to get all notes for a user
 */
async function getSupabaseNotes(userId: string) {
  try {
    const supabase = await createClient();

    // Get all notes for this user, ordered by pin status and order
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("author", userId)
      .order("is_pinned", { ascending: false }) // Pinned notes first
      .order("order", { ascending: true }); // Then by order

    if (error) {
      throw error;
    }

    // Map the database column names to our Note type
    const notes = data.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      createdAt: new Date(item.created_at).getTime(),
      updatedAt: new Date(item.updated_at).getTime(),
      pinned: item.is_pinned,
      isPrivate: item.is_private,
      isCollapsed: item.is_collapsed,
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
}

/**
 * Transfer a note from Redis to Supabase
 */
export async function transferNoteToSupabaseAction(
  redisUserId: string,
  authUserId: string,
  noteId: string,
) {
  try {
    const supabase = await createClient();

    // Verify this is an authenticated user
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user || userData.user.id !== authUserId) {
      return {
        success: false,
        error: "Unauthorized: User is not authenticated or ID mismatch",
      };
    }

    // Import the Redis action to get the note
    const { getNotesByUserIdAction } = await import(
      "@/app/actions/noteActions"
    );

    // Get the Redis notes
    const redisResult = await getNotesByUserIdAction(redisUserId);

    if (!redisResult.success || !redisResult.notes) {
      throw new Error("Failed to get notes from Redis");
    }

    // Find the specific note to transfer
    const noteToTransfer = redisResult.notes.find((note) => note.id === noteId);

    if (!noteToTransfer) {
      throw new Error(`Note ${noteId} not found in Redis`);
    }

    // Get all notes to determine the new order
    const { data: existingNotes, error: notesError } = await supabase
      .from("notes")
      .select("order")
      .eq("author", authUserId)
      .eq("is_pinned", noteToTransfer.pinned || false)
      .order("order", { ascending: false }) // Get highest order first
      .limit(1);

    if (notesError) {
      throw notesError;
    }

    // Determine the order value for the new note
    let order = 0;
    if (
      existingNotes &&
      existingNotes.length > 0 &&
      existingNotes[0].order !== null
    ) {
      order = (existingNotes[0].order || 0) + 1;
    }

    // Prepare the note data for insertion
    const noteData = {
      id: noteToTransfer.id,
      author: authUserId,
      title: noteToTransfer.title,
      content: noteToTransfer.content || "",
      created_at: new Date(
        noteToTransfer.createdAt || Date.now(),
      ).toISOString(),
      updated_at: new Date(
        noteToTransfer.updatedAt || Date.now(),
      ).toISOString(),
      is_pinned: noteToTransfer.pinned || false,
      is_private: noteToTransfer.isPrivate || false,
      is_collapsed: noteToTransfer.isCollapsed || false,
      order: order,
      // Add a field to indicate this note was transferred from Redis
      transferred_from_redis: true,
      redis_user_id: redisUserId,
    };

    // Check if the note already exists in Supabase
    const { data: existingNote, error: existingError } = await supabase
      .from("notes")
      .select("id")
      .eq("id", noteToTransfer.id)
      .eq("author", authUserId)
      .single();

    if (existingError && existingError.code !== "PGRST116") {
      // PGRST116 means no rows returned, which is expected if the note doesn't exist yet
      throw existingError;
    }

    let action;
    if (existingNote) {
      // Update the existing note
      action = supabase
        .from("notes")
        .update(noteData)
        .eq("id", noteToTransfer.id)
        .eq("author", authUserId);
    } else {
      // Insert a new note
      action = supabase.from("notes").insert(noteData);
    }

    const { error: saveError } = await action;

    if (saveError) {
      throw saveError;
    }

    // Get the updated list of notes
    const { success, notes, error } = await getSupabaseNotes(authUserId);

    if (!success) {
      throw new Error(error);
    }

    revalidatePath("/");
    return {
      success: true,
      notes,
      message: "Note transferred successfully to your account.",
    };
  } catch (error) {
    console.error("Failed to transfer note to Supabase:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to transfer note: ${errorMessage}`,
    };
  }
}

/**
 * Check if a user is authenticated
 */
export async function isUserAuthenticated() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return { isAuthenticated: false, userId: null };
    }

    return {
      isAuthenticated: true,
      userId: data.user.id,
      user: data.user,
    };
  } catch (error) {
    console.error("Error checking authentication status:", error);
    return { isAuthenticated: false, userId: null };
  }
}
