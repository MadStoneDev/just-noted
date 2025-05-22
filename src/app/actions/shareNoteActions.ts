"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

/**
 * Generate a unique shortcode for sharing
 */
function generateShortcode(length = 9) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = "";

  // Use crypto.getRandomValues for better randomness
  const randomArray = new Uint8Array(length);
  crypto.getRandomValues(randomArray);

  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomArray[i] % chars.length);
  }

  return result;
}

/**
 * Share a note with a specific user or make it public
 * Authorization is handled in application code since RLS is disabled
 */
export async function shareNoteAction({
  noteId,
  isPublic,
  username = null,
  currentUserId,
  storage = "supabase",
}: {
  noteId: string;
  isPublic: boolean;
  username?: string | null;
  currentUserId: string;
  storage: "redis" | "supabase";
}) {
  const supabase = await createClient();

  try {
    // AUTHORIZATION CHECK: Verify note ownership based on storage type
    let noteExists = false;

    if (storage === "supabase") {
      const { data: noteData, error: noteError } = await supabase
        .from("notes")
        .select("id, author")
        .eq("id", noteId)
        .eq("author", currentUserId);

      if (!noteError && noteData && noteData.length > 0) {
        noteExists = true;
      }
    } else if (storage === "redis") {
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
    const { data: existingShares, error: shareError } = await supabase
      .from("shared_notes")
      .select("id, shortcode, is_public, storage")
      .eq("note_id", noteId)
      .eq("note_owner_id", currentUserId); // AUTHORIZATION: Only get shares owned by current user

    if (shareError) {
      console.error("Error checking for existing share:", shareError);
      return {
        success: false,
        error: "Failed to check existing shares",
      };
    }

    let shortcode;
    let shareId;

    if (!existingShares || existingShares.length === 0) {
      // Create new share
      shortcode = generateShortcode();

      const { data: newShare, error: insertError } = await supabase
        .from("shared_notes")
        .insert({
          note_id: noteId,
          note_owner_id: currentUserId, // AUTHORIZATION: Always use current user
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
          error: `Failed to create share: ${
            insertError?.message || "Unknown error"
          }`,
        };
      }

      shareId = newShare.id;
    } else {
      const existingShare = existingShares[0];
      shortcode = existingShare.shortcode;
      shareId = existingShare.id;

      // AUTHORIZATION CHECK: Verify ownership before updating
      const { error: updateError } = await supabase
        .from("shared_notes")
        .update({
          is_public: isPublic,
          updated_at: new Date().toISOString(),
        })
        .eq("id", shareId)
        .eq("note_owner_id", currentUserId); // AUTHORIZATION: Only update if owned by current user

      if (updateError) {
        console.error("Error updating share:", updateError);
        return {
          success: false,
          error: "Failed to update share",
        };
      }
    }

    // Handle specific user sharing
    if (!isPublic && username) {
      const { data: userData, error: userError } = await supabase
        .from("authors")
        .select("id, username")
        .eq("username", username);

      if (userError || !userData || userData.length === 0) {
        return {
          success: false,
          error: "Username not found",
        };
      }

      const user = userData[0];

      // Check existing access
      const { data: existingReaders, error: readerError } = await supabase
        .from("shared_notes_readers")
        .select("id")
        .eq("shared_note", shareId)
        .eq("reader_username", username);

      if (readerError) {
        console.error("Error checking existing reader:", readerError);
        return {
          success: false,
          error: "Failed to check existing access",
        };
      }

      if (!existingReaders || existingReaders.length === 0) {
        // AUTHORIZATION CHECK: Verify the share belongs to current user before adding readers
        const { data: shareCheck } = await supabase
          .from("shared_notes")
          .select("note_owner_id")
          .eq("id", shareId)
          .single();

        if (!shareCheck || shareCheck.note_owner_id !== currentUserId) {
          return {
            success: false,
            error: "Unauthorized to add readers to this share",
          };
        }

        const { error: insertReaderError } = await supabase
          .from("shared_notes_readers")
          .insert({
            shared_note: shareId,
            reader_username: username,
            reader_id: user.id,
          });

        if (insertReaderError) {
          console.error("Error adding reader:", insertReaderError);
          return {
            success: false,
            error: "Failed to share with user",
          };
        }
      } else {
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
 * Authorization handled in application code
 */
export async function getSharedUsersAction(
  noteId: string,
  currentUserId: string,
) {
  const supabase = await createClient();

  try {
    // AUTHORIZATION CHECK: Only get shares owned by current user
    const { data: shareData, error: shareError } = await supabase
      .from("shared_notes")
      .select("id, shortcode, is_public, storage")
      .eq("note_id", noteId)
      .eq("note_owner_id", currentUserId); // AUTHORIZATION: Filter by current user

    if (shareError) {
      console.error("Error getting shared note:", shareError);
      return {
        success: false,
        error: "Failed to get shared note information",
      };
    }

    // If no records found, return empty results
    if (!shareData || shareData.length === 0) {
      return {
        success: true,
        isPublic: false,
        shortcode: null,
        storage: "supabase",
        users: [],
      };
    }

    const shareRecord = shareData[0];

    // Get reader usernames for this shared note
    const { data: readersData, error: readersError } = await supabase
      .from("shared_notes_readers")
      .select("reader_username")
      .eq("shared_note", shareRecord.id);

    if (readersError) {
      console.error("Error getting readers:", readersError);
      return {
        success: false,
        error: "Failed to get shared users",
      };
    }

    const users = readersData.map((reader) => reader.reader_username);

    return {
      success: true,
      isPublic: shareRecord.is_public,
      shortcode: shareRecord.shortcode,
      storage: shareRecord.storage,
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
 * Get a note by its shortcode - note can be in Redis or Supabase
 * Share info is ALWAYS in Supabase shared_notes table
 */
export async function getNoteByShortcodeAction(
  shortcode: string,
  currentUsername: string | null = null,
) {
  const supabase = await createClient();

  try {
    // Find the shared note entry in Supabase (always stored here)
    const { data: shareData, error: shareError } = await supabase
      .from("shared_notes")
      .select("*") // Get all fields including storage type
      .eq("shortcode", shortcode);

    if (shareError || !shareData || shareData.length === 0) {
      return {
        success: false,
        error: "Shared note not found",
      };
    }

    // Take the first record (shortcode should be unique)
    const shareRecord = shareData[0];

    // Check access permissions
    const isPublic = shareRecord.is_public;

    // If not public, check if the user has access
    if (!isPublic && currentUsername) {
      // Check if this username has access
      const { data: readerData, error: readerError } = await supabase
        .from("shared_notes_readers")
        .select("id")
        .eq("shared_note", shareRecord.id)
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

    // Get the note based on storage type (from the share record)
    const noteId = shareRecord.note_id;
    const noteOwnerId = shareRecord.note_owner_id;
    const storage = shareRecord.storage || "supabase"; // Default to supabase if not specified

    let note;
    let authorData;

    if (storage === "supabase") {
      // Get Supabase note
      const { data: noteData, error: noteError } = await supabase
        .from("notes")
        .select(
          "id, title, content, author, is_private, is_pinned, created_at, updated_at",
        )
        .eq("id", noteId);

      if (noteError || !noteData || noteData.length === 0) {
        console.log("Supabase note not found. Note ID:", noteId);
        return {
          success: false,
          error: "Note not found in database",
        };
      }

      note = noteData[0];

      // Get author info
      const { data: authors, error: authorError } = await supabase
        .from("authors")
        .select("username, avatar_url")
        .eq("id", note.author);

      authorData = authors && authors.length > 0 ? authors[0] : null;
    } else if (storage === "redis") {
      // Get Redis note
      const redis = (await import("@/utils/redis")).default;
      try {
        const notes = await redis.get(`notes:${noteOwnerId}`);
        if (notes) {
          const parsedNotes = notes as any[];
          const redisNote = parsedNotes.find((n) => n.id === noteId);

          if (!redisNote) {
            console.log(
              "Redis note not found. Note ID:",
              noteId,
              "Owner:",
              noteOwnerId,
            );
            return {
              success: false,
              error: "Note not found in local storage",
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

          // Get author info from Supabase (user info is always in Supabase)
          const { data: authors, error: authorError } = await supabase
            .from("authors")
            .select("username, avatar_url")
            .eq("id", noteOwnerId);

          authorData = authors && authors.length > 0 ? authors[0] : null;
        } else {
          console.log("No Redis notes found for user:", noteOwnerId);
          return {
            success: false,
            error: "Note not found in local storage",
          };
        }
      } catch (error) {
        console.error("Error fetching Redis note:", error);
        return {
          success: false,
          error: "Failed to retrieve note from local storage",
        };
      }
    } else {
      return {
        success: false,
        error: "Unknown storage type",
      };
    }

    // Increment view count (always in Supabase)
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
        shareInfo: {
          shortcode: shareRecord.shortcode,
          isPublic: shareRecord.is_public,
          storage: shareRecord.storage,
          createdAt: shareRecord.created_at,
          viewCount: shareRecord.view_count || 0,
        },
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
 * Authorization handled in application code
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
    // AUTHORIZATION CHECK: Get the shared note and verify ownership
    const { data: shareData, error: shareError } = await supabase
      .from("shared_notes")
      .select("id, note_id, note_owner_id")
      .eq("note_id", noteId)
      .eq("note_owner_id", currentUserId); // AUTHORIZATION: Only get shares owned by current user

    if (shareError || !shareData || shareData.length === 0) {
      return {
        success: false,
        error: "Shared note not found or you don't have permission",
      };
    }

    const shareRecord = shareData[0];

    // Remove the reader
    const { error } = await supabase
      .from("shared_notes_readers")
      .delete()
      .eq("shared_note", shareRecord.id)
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
