"use client";

import { createClient } from "@/utils/supabase/client";

// Generate a random shortcode (8 characters, case-sensitive)
function generateShortcode(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let shortcode = "";

  for (let i = 0; i < 8; i++) {
    shortcode += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return shortcode;
}

// Check if a shortcode already exists
async function shortcodeExists(
  supabase: any,
  shortcode: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("shared_notes")
    .select("id")
    .eq("shortcode", shortcode)
    .maybeSingle();

  return !!data; // Return true if data exists (shortcode is taken)
}

// Generate a unique shortcode with retries
async function generateUniqueShortcode(
  supabase: any,
  maxAttempts = 5,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shortcode = generateShortcode();
    const exists = await shortcodeExists(supabase, shortcode);

    if (!exists) {
      return shortcode; // Found a unique shortcode
    }

    // If we're here, the shortcode exists, try again
    console.log(
      `Shortcode collision detected (attempt ${
        attempt + 1
      }), generating new code...`,
    );
  }

  // If we've exhausted all attempts, throw an error
  throw new Error(
    `Failed to generate a unique shortcode after ${maxAttempts} attempts`,
  );
}

// Interface for the share request
interface ShareRequest {
  noteId: string;
  noteOwnerId: string;
  storage: "redis" | "supabase";
  isPublic: boolean;
  recipientUsername: string | null;
  expiresInDays?: number; // Optional: add expiration in days
}

export async function shareNoteAction(request: ShareRequest) {
  try {
    const supabase = createClient();

    // Check authentication if sharing privately
    if (!request.isPublic) {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        return {
          success: false,
          error: "You must be logged in to share a note privately",
        };
      }

      // Verify the recipient username exists
      if (request.recipientUsername) {
        const { data: recipientData, error: recipientError } = await supabase
          .from("authors")
          .select("id")
          .eq("username", request.recipientUsername)
          .single();

        if (recipientError || !recipientData) {
          return {
            success: false,
            error: `User "${request.recipientUsername}" not found`,
          };
        }
      }
    }

    // Calculate expiration date if provided
    let expiresAt = null;
    if (request.expiresInDays && request.expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + request.expiresInDays);
    }

    // Generate a unique shortcode
    const shortcode = await generateUniqueShortcode(supabase);

    // Insert the new shared note
    const { data, error } = await supabase
      .from("shared_notes")
      .insert({
        note_id: request.noteId,
        shortcode: shortcode,
        storage: request.storage,
        note_owner_id: request.noteOwnerId,
        reader_username: request.isPublic ? null : request.recipientUsername,
        is_public: request.isPublic,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
      })
      .select("shortcode")
      .single();

    if (error) {
      console.error("Error inserting shared note:", error);
      return {
        success: false,
        error: "Failed to create sharing link",
      };
    }

    // Return the success response with the shortcode
    return {
      success: true,
      shortcode: data.shortcode,
    };
  } catch (error) {
    console.error("Error in shareNoteAction:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

export async function incrementSharedNoteViewCount(shortcode: string) {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("shared_notes")
      .update({
        view_count: supabase.rpc("increment_view_count", {
          shortcode_param: shortcode,
        }),
      })
      .eq("shortcode", shortcode)
      .select("view_count")
      .single();

    if (error) {
      console.error("Error incrementing view count:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error in incrementSharedNoteViewCount:", error);
    return false;
  }
}

export async function deleteSharedNoteAction(shortcode: string) {
  try {
    const supabase = createClient();

    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Delete the share
    const { error } = await supabase
      .from("shared_notes")
      .delete()
      .match({
        shortcode: shortcode,
        ...(user ? { note_owner_id: user.id } : {}), // Only allow users to delete their own shares
      });

    if (error) {
      console.error("Error deleting shared note:", error);
      return {
        success: false,
        error: "Failed to delete shared note",
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error in deleteSharedNoteAction:", error);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}
