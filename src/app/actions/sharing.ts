"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { NOTES_KEY_PREFIX } from "@/constants/app";

// ===========================
// TYPES
// ===========================

type SharingOperationParams =
  | {
      operation: "share";
      noteId: string;
      isPublic: boolean;
      username?: string | null;
      currentUserId: string;
      storage: "redis" | "supabase";
    }
  | { operation: "getUsers"; noteId: string; currentUserId: string }
  | {
      operation: "getByShortcode";
      shortcode: string;
      currentUsername: string | null;
    }
  | {
      operation: "removeUser";
      noteId: string;
      username: string;
      currentUserId: string;
    }
  | { operation: "stopSharing"; noteId: string; currentUserId: string };

interface NormalizedNote {
  id: string;
  title: string;
  content: string;
  author: string;
  is_private: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

// ===========================
// UTILITIES
// ===========================

function generateShortcode(length = 9): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const randomArray = new Uint8Array(length);
  crypto.getRandomValues(randomArray);

  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomArray[i] % chars.length);
  }
  return result;
}

// ===========================
// NOTE VERIFICATION HELPERS
// ===========================

async function verifySupabaseNoteOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  noteId: string,
  currentUserId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("notes")
    .select("id")
    .eq("id", noteId)
    .eq("author", currentUserId)
    .single();

  return !!data;
}

async function verifyRedisNoteOwnership(
  noteId: string,
  currentUserId: string,
): Promise<boolean> {
  try {
    const redis = (await import("@/utils/redis")).default;
    const notesData = await redis.get(`${NOTES_KEY_PREFIX}${currentUserId}`);

    if (!notesData || !Array.isArray(notesData)) {
      return false;
    }

    return notesData.some((note: any) => note?.id === noteId);
  } catch (error) {
    console.error("Redis note verification failed:", error);
    return false;
  }
}

// ===========================
// NOTE FETCHING HELPERS
// ===========================

async function fetchSupabaseNote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  noteId: string,
): Promise<{ success: boolean; note?: NormalizedNote; error?: string }> {
  const { data, error } = await supabase
    .from("notes")
    .select(
      "id, title, content, author, is_private, is_pinned, created_at, updated_at",
    )
    .eq("id", noteId)
    .single();

  if (error || !data) {
    return { success: false, error: "Note not found in database" };
  }

  return { success: true, note: data as NormalizedNote };
}

async function fetchRedisNote(
  noteId: string,
  noteOwnerId: string,
): Promise<{ success: boolean; note?: NormalizedNote; error?: string }> {
  try {
    const redis = (await import("@/utils/redis")).default;
    const notesData = await redis.get(`${NOTES_KEY_PREFIX}${noteOwnerId}`);

    if (!notesData || !Array.isArray(notesData)) {
      return { success: false, error: "Note not found in local storage" };
    }

    const redisNote = notesData.find((n: any) => n?.id === noteId);

    if (!redisNote) {
      return { success: false, error: "Note not found in local storage" };
    }

    // Normalize to match Supabase format
    const normalizedNote: NormalizedNote = {
      id: redisNote.id,
      title: redisNote.title || "Untitled",
      content: redisNote.content || "",
      author: noteOwnerId,
      is_private: redisNote.isPrivate || false,
      is_pinned: redisNote.pinned || false,
      created_at:
        typeof redisNote.createdAt === "number"
          ? new Date(redisNote.createdAt).toISOString()
          : new Date().toISOString(),
      updated_at:
        typeof redisNote.updatedAt === "number"
          ? new Date(redisNote.updatedAt).toISOString()
          : new Date().toISOString(),
    };

    return { success: true, note: normalizedNote };
  } catch (error) {
    console.error("Redis note fetch failed:", error);
    return {
      success: false,
      error: "Failed to retrieve note from local storage",
    };
  }
}

async function fetchAuthorInfo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authorId: string,
): Promise<{ username: string; avatar_url: string | null }> {
  const { data } = await supabase
    .from("authors")
    .select("username, avatar_url")
    .eq("id", authorId)
    .single();

  return data || { username: "Unknown", avatar_url: null };
}

// ===========================
// MAIN OPERATIONS
// ===========================

export async function sharingOperation(params: SharingOperationParams) {
  const supabase = await createClient();
  const { operation } = params;

  try {
    switch (operation) {
      case "share": {
        const {
          noteId,
          isPublic,
          username = null,
          currentUserId,
          storage = "supabase",
        } = params;

        // Verify note ownership
        const noteExists =
          storage === "supabase"
            ? await verifySupabaseNoteOwnership(supabase, noteId, currentUserId)
            : await verifyRedisNoteOwnership(noteId, currentUserId);

        if (!noteExists) {
          return {
            success: false,
            error: "Note not found or you don't have permission to share it",
          };
        }

        // Check existing shares
        const { data: existingShares } = await supabase
          .from("shared_notes")
          .select("id, shortcode")
          .eq("note_id", noteId)
          .eq("note_owner_id", currentUserId);

        let shortcode: string;
        let shareId: string;

        if (!existingShares || existingShares.length === 0) {
          // Create new share
          shortcode = generateShortcode();

          const { data: newShare, error: insertError } = await supabase
            .from("shared_notes")
            .insert({
              note_id: noteId,
              note_owner_id: currentUserId,
              shortcode,
              is_public: isPublic,
              storage,
            })
            .select("id")
            .single();

          if (insertError || !newShare) {
            return {
              success: false,
              error: `Failed to create share: ${
                insertError?.message || "Unknown error"
              }`,
            };
          }

          shareId = newShare.id;
        } else {
          // Update existing share
          const existingShare = existingShares[0];
          shortcode = existingShare.shortcode;
          shareId = existingShare.id;

          const { error: updateError } = await supabase
            .from("shared_notes")
            .update({
              is_public: isPublic,
              updated_at: new Date().toISOString(),
            })
            .eq("id", shareId)
            .eq("note_owner_id", currentUserId);

          if (updateError) {
            return { success: false, error: "Failed to update share" };
          }
        }

        // Handle specific user sharing
        if (!isPublic && username) {
          const { data: userData } = await supabase
            .from("authors")
            .select("id, username")
            .eq("username", username)
            .single();

          if (!userData) {
            return { success: false, error: "Username not found" };
          }

          // Check if user already has access
          const { data: existingReaders } = await supabase
            .from("shared_notes_readers")
            .select("id")
            .eq("shared_note", shareId)
            .eq("reader_username", username)
            .single();

          if (existingReaders) {
            return {
              success: true,
              shortcode,
              message: "User already has access",
            };
          }

          // Add reader
          const { error: insertReaderError } = await supabase
            .from("shared_notes_readers")
            .insert({
              shared_note: shareId,
              reader_username: username,
              reader_id: userData.id,
            });

          if (insertReaderError) {
            return { success: false, error: "Failed to share with user" };
          }
        }

        revalidatePath("/");
        return { success: true, shortcode };
      }

      case "getUsers": {
        const { noteId, currentUserId } = params;

        const { data: shareData } = await supabase
          .from("shared_notes")
          .select("id, shortcode, is_public, storage")
          .eq("note_id", noteId)
          .eq("note_owner_id", currentUserId)
          .single();

        if (!shareData) {
          return {
            success: true,
            isPublic: false,
            shortcode: null,
            storage: "supabase",
            users: [],
          };
        }

        const { data: readersData } = await supabase
          .from("shared_notes_readers")
          .select("reader_username")
          .eq("shared_note", shareData.id);

        const users =
          readersData?.map((reader) => reader.reader_username) || [];

        return {
          success: true,
          isPublic: shareData.is_public,
          shortcode: shareData.shortcode,
          storage: shareData.storage || "supabase",
          users,
        };
      }

      case "getByShortcode": {
        const { shortcode, currentUsername } = params;

        // Fetch share record
        const { data: shareData, error: shareError } = await supabase
          .from("shared_notes")
          .select("*")
          .eq("shortcode", shortcode)
          .single();

        if (shareError || !shareData) {
          return { success: false, error: "Shared note not found" };
        }

        // Check access permissions
        if (!shareData.is_public) {
          if (!currentUsername) {
            return {
              success: false,
              error: "You need to sign in to access this shared note",
            };
          }

          const { data: readerData } = await supabase
            .from("shared_notes_readers")
            .select("id")
            .eq("shared_note", shareData.id)
            .eq("reader_username", currentUsername)
            .single();

          if (!readerData) {
            return {
              success: false,
              error: "You don't have access to this note",
            };
          }
        }

        // Fetch the note
        const storage = shareData.storage || "supabase";
        const noteResult =
          storage === "supabase"
            ? await fetchSupabaseNote(supabase, shareData.note_id)
            : await fetchRedisNote(shareData.note_id, shareData.note_owner_id);

        if (!noteResult.success || !noteResult.note) {
          return { success: false, error: noteResult.error };
        }

        // Fetch author info
        const authorInfo = await fetchAuthorInfo(
          supabase,
          noteResult.note.author,
        );

        // Increment view count (non-critical)
        supabase.rpc("increment_view_count", { shortcode_param: shortcode });

        return {
          success: true,
          note: {
            ...noteResult.note,
            authorUsername: authorInfo.username,
            authorAvatar: authorInfo.avatar_url,
            shareInfo: {
              shortcode: shareData.shortcode,
              isPublic: shareData.is_public,
              storage: shareData.storage,
              createdAt: shareData.created_at,
              viewCount: shareData.view_count || 0,
            },
          },
        };
      }

      case "removeUser": {
        const { noteId, username, currentUserId } = params;

        const { data: shareData } = await supabase
          .from("shared_notes")
          .select("id")
          .eq("note_id", noteId)
          .eq("note_owner_id", currentUserId)
          .single();

        if (!shareData) {
          return {
            success: false,
            error: "Shared note not found or you don't have permission",
          };
        }

        const { error } = await supabase
          .from("shared_notes_readers")
          .delete()
          .eq("shared_note", shareData.id)
          .eq("reader_username", username);

        if (error) {
          return { success: false, error: "Failed to remove user access" };
        }

        revalidatePath("/");
        return { success: true };
      }

      case "stopSharing": {
        const { noteId, currentUserId } = params;

        const { error } = await supabase
          .from("shared_notes")
          .delete()
          .eq("note_id", noteId)
          .eq("note_owner_id", currentUserId);

        if (error) {
          return { success: false, error: "Failed to stop sharing" };
        }

        revalidatePath("/");
        return { success: true };
      }

      default:
        return { success: false, error: "Unknown operation" };
    }
  } catch (error) {
    console.error(`Sharing operation ${operation} failed:`, error);
    return { success: false, error: "An unexpected error occurred" };
  }
}
