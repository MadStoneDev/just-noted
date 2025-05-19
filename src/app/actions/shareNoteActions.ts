"use server";

import { createClient } from "@/utils/supabase/server";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";

/**
 * Generate a unique shortcode for sharing
 */
function generateShortcode(length = 8) {
  return randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}

/**
 * Share a note with a specific user or make it public
 */
export async function shareNoteAction({
  noteId,
  isPublic,
  username = null,
  currentUserId,
  storage = "supabase", // 'redis' or 'supabase'
}: {
  noteId: string;
  isPublic: boolean;
  username?: string | null;
  currentUserId: string;
  storage: "redis" | "supabase";
}) {
  const supabase = await createClient();

  try {
    // Verify note ownership based on storage type
    let noteExists = false;

    if (storage === "supabase") {
      // For Supabase notes, check database
      const { data: noteData, error: noteError } = await supabase
        .from("notes")
        .select("id, author")
        .eq("id", noteId)
        .eq("author", currentUserId)
        .single();

      noteExists = !noteError && !!noteData;
    } else if (storage === "redis") {
      // For Redis notes, we'll need to verify if this user owns the note
      // We'll need to import the redis client and check
      const redis = (await import("@/utils/redis")).default;
      try {
        const notes = await redis.get(`notes:${currentUserId}`);
        if (notes) {
          const parsedNotes = notes as any[];
          const note = parsedNotes.find((n) => n.id === noteId);
          noteExists = !!note;
        }
      } catch (error) {
        console.error("Error checking Redis note:", error);
      }
    }

    if (!noteExists) {
      return {
        success: false,
        error: "Note not found or you don't have permission to share it",
      };
    }

    // Check if the note is already shared
    const { data: existingShare, error: shareError } = await supabase
      .from("shared_notes")
      .select("id, shortcode, is_public, storage")
      .eq("note_id", noteId)
      .eq("note_owner_id", currentUserId)
      .single();

    let shortcode;
    let shareId;

    if (shareError?.code === "PGRST116") {
      // No share exists yet, create a new one
      shortcode = generateShortcode();

      // Create the share record
      const { data: newShare, error: insertError } = await supabase
        .from("shared_notes")
        .insert({
          note_id: noteId,
          note_owner_id: currentUserId,
          shortcode: shortcode,
          is_public: isPublic,
          storage: storage,
        })
        .select("id")
        .single();

      if (insertError || !newShare) {
        console.error("Error creating share:", insertError);
        return {
          success: false,
          error: "Failed to create share",
        };
      }

      shareId = newShare.id;
    } else if (shareError) {
      // A real error occurred
      console.error("Error checking for existing share:", shareError);
      return {
        success: false,
        error: "Failed to check existing shares",
      };
    } else {
      // Share already exists
      shortcode = existingShare.shortcode;
      shareId = existingShare.id;

      // Update the share status
      const { error: updateError } = await supabase
        .from("shared_notes")
        .update({
          is_public: isPublic,
          updated_at: new Date().toISOString(),
        })
        .eq("id", shareId);

      if (updateError) {
        console.error("Error updating share:", updateError);
        return {
          success: false,
          error: "Failed to update share",
        };
      }
    }

    // If sharing with a specific user (not public)
    if (!isPublic && username) {
      // Verify the username exists
      const { data: userData, error: userError } = await supabase
        .from("authors")
        .select("id, username")
        .eq("username", username)
        .single();

      if (userError || !userData) {
        return {
          success: false,
          error: "Username not found",
        };
      }

      // Check if this user already has access
      const { data: existingReader, error: readerError } = await supabase
        .from("shared_notes_readers")
        .select("id")
        .eq("shared_note", shareId)
        .eq("reader_username", username)
        .single();

      if (!existingReader) {
        // Add the reader
        const { error: insertReaderError } = await supabase
          .from("shared_notes_readers")
          .insert({
            shared_note: shareId,
            reader_username: username,
            reader_id: userData.id,
          });

        if (insertReaderError) {
          console.error("Error adding reader:", insertReaderError);
          return {
            success: false,
            error: "Failed to share with user",
          };
        }
      } else {
        // User already has access
        return {
          success: true,
          shortcode,
          message: "User already has access",
        };
      }
    }

    revalidatePath("/");

    return {
      success: true,
      shortcode,
    };
  } catch (error) {
    console.error("Error sharing note:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

/**
 * Get all users a note is shared with
 */
export async function getSharedUsersAction(
  noteId: string,
  currentUserId: string,
) {
  const supabase = await createClient();

  try {
    // Get the shared note information
    const { data: shareData, error: shareError } = await supabase
      .from("shared_notes")
      .select("id, shortcode, is_public, storage")
      .eq("note_id", noteId)
      .eq("note_owner_id", currentUserId)
      .single();

    // If no record found, just return empty results (not an error)
    if (shareError?.code === "PGRST116") {
      // This is the "no rows found" error code
      return {
        success: true,
        isPublic: false,
        shortcode: null,
        storage: "supabase",
        users: [],
      };
    }

    // Handle actual errors
    if (shareError) {
      console.error("Error getting shared note:", shareError);
      return {
        success: false,
        error: "Failed to get shared note information",
      };
    }

    // Get reader usernames for this shared note
    const { data: readersData, error: readersError } = await supabase
      .from("shared_notes_readers")
      .select("reader_username")
      .eq("shared_note", shareData.id);

    if (readersError) {
      console.error("Error getting readers:", readersError);
      return {
        success: false,
        error: "Failed to get shared users",
      };
    }

    // Extract usernames
    const users = readersData.map((reader) => reader.reader_username);

    return {
      success: true,
      isPublic: shareData.is_public,
      shortcode: shareData.shortcode,
      storage: shareData.storage,
      users,
    };
  } catch (error) {
    console.error("Error getting shared users:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

/**
 * Get a note by its shortcode
 */
export async function getNoteByShortcodeAction(
  shortcode: string,
  currentUsername: string | null = null,
) {
  const supabase = await createClient();

  try {
    // First find the shared note entry
    const { data: shareData, error: shareError } = await supabase
      .from("shared_notes")
      .select()
      .eq("shortcode", shortcode);

    if (shareError || !shareData || shareData.length === 0) {
      return {
        success: false,
        error: "Shared note not found",
      };
    }

    // Check access permissions
    const isPublic = shareData[0].is_public;

    // If not public, check if the user has access
    if (!isPublic && currentUsername) {
      // Check if this username has access
      const { data: readerData, error: readerError } = await supabase
        .from("shared_notes_readers")
        .select("id")
        .eq("shared_note", shareData[0].id)
        .eq("reader_username", currentUsername);

      if (readerError || !readerData || readerData.length === 0) {
        return {
          success: false,
          error: "You don't have access to this note",
        };
      }
    } else if (!isPublic && !currentUsername) {
      return {
        success: false,
        error: "You need to sign in to access this shared note",
      };
    }

    // Get the note based on storage type
    const noteId = shareData[0].note_id;
    const noteOwnerId = shareData[0].note_owner_id;
    const storage = shareData[0].storage || "supabase";

    let note;
    let authorData;

    if (storage === "supabase") {
      // Get Supabase note
      const { data: noteData, error: noteError } = await supabase
        .from("notes")
        .select(
          "id, title, content, author, is_private, is_pinned, created_at, updated_at",
        )
        .eq("id", noteId)
        .single();

      if (noteError || !noteData) {
        console.log(noteId);
        return {
          success: false,
          error: "Note not found",
        };
      }

      note = noteData;

      // Get author info
      const { data: author, error: authorError } = await supabase
        .from("authors")
        .select("username, avatar_url")
        .eq("id", note.author)
        .single();

      authorData = author;
    } else {
      // Get Redis note
      const redis = (await import("@/utils/redis")).default;
      try {
        const notes = await redis.get(`notes:${noteOwnerId}`);
        if (notes) {
          const parsedNotes = notes as any[];
          const redisNote = parsedNotes.find((n) => n.id === noteId);

          if (!redisNote) {
            return {
              success: false,
              error: "Note not found",
            };
          }

          // Convert Redis note format to match Supabase format
          note = {
            id: redisNote.id,
            title: redisNote.title,
            content: redisNote.content,
            author: noteOwnerId,
            is_private: redisNote.isPrivate || false,
            is_pinned: redisNote.pinned || false,
            created_at: new Date(
              redisNote.createdAt || Date.now(),
            ).toISOString(),
            updated_at: new Date(
              redisNote.updatedAt || Date.now(),
            ).toISOString(),
          };

          // Get author info
          const { data: author, error: authorError } = await supabase
            .from("authors")
            .select("username, avatar_url")
            .eq("id", noteOwnerId)
            .single();

          authorData = author;
        } else {
          return {
            success: false,
            error: "Note not found",
          };
        }
      } catch (error) {
        console.error("Error fetching Redis note:", error);
        return {
          success: false,
          error: "Failed to retrieve note",
        };
      }
    }

    // Increment view count
    try {
      await supabase.rpc("increment_view_count", {
        shortcode_param: shortcode,
      });
    } catch (error) {
      console.error("Error incrementing view count:", error);
      // Don't fail the whole operation if view count increment fails
    }

    return {
      success: true,
      note: {
        ...note,
        authorUsername: authorData?.username || "Unknown",
        authorAvatar: authorData?.avatar_url || null,
      },
    };
  } catch (error) {
    console.error("Error getting note by shortcode:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

/**
 * Remove sharing access for a specific user
 */
export async function removeSharedUserAction({
  noteId,
  username,
  currentUserId,
}: {
  noteId: string;
  username: string;
  currentUserId: string;
}) {
  const supabase = await createClient();

  try {
    // Get the shared note id first
    const { data: shareData, error: shareError } = await supabase
      .from("shared_notes")
      .select("id, note_id, note_owner_id")
      .eq("note_id", noteId)
      .eq("note_owner_id", currentUserId)
      .single();

    if (shareError) {
      return {
        success: false,
        error: "Shared note not found",
      };
    }

    // Remove the reader from shared_notes_readers
    const { error } = await supabase
      .from("shared_notes_readers")
      .delete()
      .eq("shared_note", shareData.id)
      .eq("reader_username", username);

    if (error) {
      return {
        success: false,
        error: "Failed to remove user access",
      };
    }

    revalidatePath("/");

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error removing shared user:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

/**
 * Stop sharing a note completely
 */
export async function stopSharingNoteAction(
  noteId: string,
  currentUserId: string,
) {
  const supabase = await createClient();

  try {
    const { error } = await supabase
      .from("shared_notes")
      .delete()
      .eq("note_id", noteId)
      .eq("note_owner_id", currentUserId);

    if (error) {
      return {
        success: false,
        error: "Failed to stop sharing",
      };
    }

    revalidatePath("/");

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error stopping note sharing:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}
