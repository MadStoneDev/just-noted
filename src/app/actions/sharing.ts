"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

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

function generateShortcode(length = 9) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = "";
  const randomArray = new Uint8Array(length);
  crypto.getRandomValues(randomArray);

  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomArray[i] % chars.length);
  }

  return result;
}

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
        let noteExists = false;

        if (storage === "supabase") {
          const { data: noteData } = await supabase
            .from("notes")
            .select("id, author")
            .eq("id", noteId)
            .eq("author", currentUserId);

          noteExists = !!(noteData && noteData.length > 0);
        } else if (storage === "redis") {
          const redis = (await import("@/utils/redis")).default;
          try {
            const notes = await redis.get(`notes:${currentUserId}`);
            if (notes) {
              const parsedNotes = notes as any[];
              noteExists = !!parsedNotes.find((n) => n.id === noteId);
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

        // Check existing shares
        const { data: existingShares } = await supabase
          .from("shared_notes")
          .select("id, shortcode, is_public, storage")
          .eq("note_id", noteId)
          .eq("note_owner_id", currentUserId);

        let shortcode;
        let shareId;

        if (!existingShares || existingShares.length === 0) {
          shortcode = generateShortcode();

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
            .eq("username", username);

          if (!userData || userData.length === 0) {
            return { success: false, error: "Username not found" };
          }

          const user = userData[0];

          const { data: existingReaders } = await supabase
            .from("shared_notes_readers")
            .select("id")
            .eq("shared_note", shareId)
            .eq("reader_username", username);

          if (!existingReaders || existingReaders.length === 0) {
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
              return { success: false, error: "Failed to share with user" };
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
        return { success: true, shortcode };
      }

      case "getUsers": {
        const { noteId, currentUserId } = params;

        const { data: shareData, error: shareError } = await supabase
          .from("shared_notes")
          .select("id, shortcode, is_public, storage")
          .eq("note_id", noteId)
          .eq("note_owner_id", currentUserId);

        if (shareError) {
          return {
            success: false,
            error: "Failed to get shared note information",
          };
        }

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

        const { data: readersData, error: readersError } = await supabase
          .from("shared_notes_readers")
          .select("reader_username")
          .eq("shared_note", shareRecord.id);

        if (readersError) {
          return { success: false, error: "Failed to get shared users" };
        }

        const users = readersData.map((reader) => reader.reader_username);

        return {
          success: true,
          isPublic: shareRecord.is_public,
          shortcode: shareRecord.shortcode,
          storage: shareRecord.storage,
          users,
        };
      }

      case "getByShortcode": {
        const { shortcode, currentUsername } = params;

        const { data: shareData, error: shareError } = await supabase
          .from("shared_notes")
          .select("*")
          .eq("shortcode", shortcode);

        if (shareError || !shareData || shareData.length === 0) {
          return { success: false, error: "Shared note not found" };
        }

        const shareRecord = shareData[0];
        const isPublic = shareRecord.is_public;

        if (!isPublic && currentUsername) {
          const { data: readerData } = await supabase
            .from("shared_notes_readers")
            .select("id")
            .eq("shared_note", shareRecord.id)
            .eq("reader_username", currentUsername);

          if (!readerData || readerData.length === 0) {
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

        const noteId = shareRecord.note_id;
        const noteOwnerId = shareRecord.note_owner_id;
        const storage = shareRecord.storage || "supabase";

        let note;
        let authorData;

        if (storage === "supabase") {
          const { data: noteData, error: noteError } = await supabase
            .from("notes")
            .select(
              "id, title, content, author, is_private, is_pinned, created_at, updated_at",
            )
            .eq("id", noteId);

          if (noteError || !noteData || noteData.length === 0) {
            return { success: false, error: "Note not found in database" };
          }

          note = noteData[0];

          const { data: authors } = await supabase
            .from("authors")
            .select("username, avatar_url")
            .eq("id", note.author);

          authorData = authors && authors.length > 0 ? authors[0] : null;
        } else if (storage === "redis") {
          const redis = (await import("@/utils/redis")).default;
          try {
            const notes = await redis.get(`notes:${noteOwnerId}`);
            if (notes) {
              const parsedNotes = notes as any[];
              const redisNote = parsedNotes.find((n) => n.id === noteId);

              if (!redisNote) {
                return {
                  success: false,
                  error: "Note not found in local storage",
                };
              }

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

              const { data: authors } = await supabase
                .from("authors")
                .select("username, avatar_url")
                .eq("id", noteOwnerId);

              authorData = authors && authors.length > 0 ? authors[0] : null;
            } else {
              return {
                success: false,
                error: "Note not found in local storage",
              };
            }
          } catch (error) {
            return {
              success: false,
              error: "Failed to retrieve note from local storage",
            };
          }
        } else {
          return { success: false, error: "Unknown storage type" };
        }

        try {
          await supabase.rpc("increment_view_count", {
            shortcode_param: shortcode,
          });
        } catch (error) {
          console.error("Error incrementing view count:", error);
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
      }

      case "removeUser": {
        const { noteId, username, currentUserId } = params;

        const { data: shareData } = await supabase
          .from("shared_notes")
          .select("id, note_id, note_owner_id")
          .eq("note_id", noteId)
          .eq("note_owner_id", currentUserId);

        if (!shareData || shareData.length === 0) {
          return {
            success: false,
            error: "Shared note not found or you don't have permission",
          };
        }

        const shareRecord = shareData[0];

        const { error } = await supabase
          .from("shared_notes_readers")
          .delete()
          .eq("shared_note", shareRecord.id)
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
