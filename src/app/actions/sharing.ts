"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
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
      isAnonymous?: boolean;
      password?: string | null;
      expiresAt?: string | null;
    }
  | { operation: "getUsers"; noteId: string; currentUserId: string }
  | {
      operation: "getByShortcode";
      shortcode: string;
      currentUsername: string | null;
      password?: string | null;
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

import bcrypt from "bcryptjs";

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

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
      "id, title, content, content_format, author, is_private, is_pinned, created_at, updated_at",
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

  // Get authenticated user — more reliable than client-passed userId
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const authenticatedUserId = authUser?.id || null;

  try {
    switch (operation) {
      case "share": {
        const {
          noteId,
          isPublic,
          username = null,
          currentUserId,
          storage = "supabase",
          isAnonymous = false,
          password = null,
          expiresAt = null,
        } = params;

        // Use server-side auth for ownership — more reliable than client-passed ID
        const ownerId = authenticatedUserId || currentUserId;

        const noteExists =
          storage === "supabase"
            ? await verifySupabaseNoteOwnership(supabase, noteId, ownerId)
            : await verifyRedisNoteOwnership(noteId, ownerId);

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
          .eq("note_owner_id", authenticatedUserId || currentUserId);

        let shortcode: string;
        let shareId: string;

        if (!existingShares || existingShares.length === 0) {
          // Create new share
          shortcode = generateShortcode();

          const passwordHash = password ? await hashPassword(password) : null;

          const { data: newShare, error: insertError } = await supabase
            .from("shared_notes")
            .insert({
              note_id: noteId,
              note_owner_id: ownerId,
              shortcode,
              is_public: isPublic,
              storage,
              is_anonymous: isAnonymous,
              password_hash: passwordHash,
              expires_at: expiresAt,
            } as any)
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

          const updateData: Record<string, any> = {
            is_public: isPublic,
            is_anonymous: isAnonymous,
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          };
          if (password !== undefined) {
            updateData.password_hash = password
              ? await hashPassword(password)
              : null;
          }

          const { error: updateError } = await supabase
            .from("shared_notes")
            .update(updateData)
            .eq("id", shareId)
            .eq("note_owner_id", authenticatedUserId || currentUserId);

          if (updateError) {
            return { success: false, error: "Failed to update share" };
          }
        }

        // Handle specific user sharing. `authors` and `shared_notes_readers`
        // are intentionally not cross-user readable/writable under RLS, so the
        // username lookup and reader insert must go through the service-role
        // client (the anon/authenticated client can only see the caller's own
        // author row, which is why this returned "Username not found").
        if (!isPublic && username) {
          const svc = createServiceRoleClient();

          const { data: userData } = await svc
            .from("authors")
            .select("id, username")
            .ilike("username", username.trim()) // case-insensitive exact match
            .maybeSingle();

          if (!userData) {
            return { success: false, error: "Username not found" };
          }

          const readerId = (userData as any).id;
          const canonicalUsername = (userData as any).username;

          // Check if user already has access
          const { data: existingReaders } = await svc
            .from("shared_notes_readers")
            .select("id")
            .eq("shared_note", shareId)
            .eq("reader_id", readerId)
            .maybeSingle();

          if (existingReaders) {
            return {
              success: true,
              shortcode,
              message: "User already has access",
            };
          }

          // Add reader — store the canonical username so access checks in
          // getByShortcode (which compare against authors.username) line up.
          const { error: insertReaderError } = await svc
            .from("shared_notes_readers")
            .insert({
              shared_note: shareId,
              reader_username: canonicalUsername,
              reader_id: readerId,
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
          .select("id, shortcode, is_public, storage, is_anonymous, password_hash, expires_at, view_count")
          .eq("note_id", noteId)
          .eq("note_owner_id", authenticatedUserId || currentUserId)
          .single();

        if (!shareData) {
          return {
            success: true,
            isPublic: false,
            shortcode: null,
            storage: "supabase",
            users: [],
            isAnonymous: false,
            hasPassword: false,
            expiresAt: null,
            viewCount: 0,
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
          isPublic: (shareData as any).is_public,
          shortcode: (shareData as any).shortcode,
          storage: (shareData as any).storage || "supabase",
          users,
          isAnonymous: (shareData as any).is_anonymous || false,
          hasPassword: !!(shareData as any).password_hash,
          expiresAt: (shareData as any).expires_at,
          viewCount: (shareData as any).view_count || 0,
        };
      }

      case "getByShortcode": {
        const { shortcode, password: providedPassword = null } = params;

        // Use service role — viewers aren't the owner, RLS would block
        const viewClient = createServiceRoleClient();
        const { data: shareData, error: shareError } = await viewClient
          .from("shared_notes")
          .select("*")
          .eq("shortcode", shortcode)
          .single();

        if (shareError || !shareData) {
          return { success: false, error: "Shared note not found" };
        }

        // Check expiration
        if ((shareData as any).expires_at) {
          const expiresAt = new Date((shareData as any).expires_at);
          if (expiresAt < new Date()) {
            return { success: false, error: "This shared link has expired" };
          }
        }

        // Check password
        if ((shareData as any).password_hash) {
          if (!providedPassword) {
            return {
              success: false,
              error: "PASSWORD_REQUIRED",
              requiresPassword: true,
            };
          }
          const passwordValid = await verifyPassword(
            providedPassword,
            (shareData as any).password_hash,
          );
          if (!passwordValid) {
            return {
              success: false,
              error: "Incorrect password",
              requiresPassword: true,
            };
          }
        }

        // Check access permissions.
        // Public shares are open to anyone with the link. Private (specific-user)
        // shares are gated on the VIEWER'S authenticated identity, derived
        // server-side — never on a client-supplied username, which could be forged.
        if (!shareData.is_public) {
          if (!authenticatedUserId) {
            return {
              success: false,
              error: "You need to sign in to access this shared note",
            };
          }

          const { data: viewerAuthor } = await viewClient
            .from("authors")
            .select("username")
            .eq("id", authenticatedUserId)
            .single();

          const viewerUsername = viewerAuthor?.username;
          if (!viewerUsername) {
            return {
              success: false,
              error: "You don't have access to this note",
            };
          }

          const { data: readerData } = await viewClient
            .from("shared_notes_readers")
            .select("id")
            .eq("shared_note", shareData.id)
            .eq("reader_username", viewerUsername)
            .single();

          if (!readerData) {
            return {
              success: false,
              error: "You don't have access to this note",
            };
          }
        }

        const storage = shareData.storage || "supabase";
        // Use service role to bypass RLS — we've already verified access above
        const serviceClient = createServiceRoleClient();
        const noteResult =
          storage === "supabase"
            ? await fetchSupabaseNote(serviceClient, shareData.note_id)
            : await fetchRedisNote(shareData.note_id, shareData.note_owner_id);

        if (!noteResult.success || !noteResult.note) {
          return { success: false, error: noteResult.error };
        }

        const isAnonymous = (shareData as any).is_anonymous || false;

        let authorInfo: { username: string; avatar_url: string | null } = {
          username: "Anonymous",
          avatar_url: null,
        };
        if (!isAnonymous) {
          authorInfo = await fetchAuthorInfo(serviceClient, noteResult.note.author);
        }

        // Fire-and-forget, but await so the promise can't reject unhandled and
        // the increment actually persists before the response returns.
        await viewClient
          .rpc("increment_view_count", { shortcode_param: shortcode })
          .then(undefined, (e: unknown) => console.error("increment_view_count failed:", e));

        return {
          success: true,
          note: {
            ...noteResult.note,
            authorUsername: authorInfo.username,
            authorAvatar: isAnonymous ? null : authorInfo.avatar_url,
            content_format: (noteResult.note as any).content_format,
            shareInfo: {
              shortcode: shareData.shortcode,
              isPublic: shareData.is_public,
              isAnonymous,
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
          .eq("note_owner_id", authenticatedUserId || currentUserId)
          .single();

        if (!shareData) {
          return {
            success: false,
            error: "Shared note not found or you don't have permission",
          };
        }

        // Ownership verified above with the authenticated client; the actual
        // delete needs the service role (readers table is service-role-only).
        const { error } = await createServiceRoleClient()
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
          .eq("note_owner_id", authenticatedUserId || currentUserId);

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

// ===========================
// SIDEBAR: SHARED LISTS
// ===========================

export interface SharedListItem {
  shortcode: string;
  title: string;
  /** Owner username (for "shared with me") — "Anonymous" when the share hides it. */
  owner?: string;
  /** For "shared by me". */
  isPublic?: boolean;
  viewCount?: number;
  readerCount?: number;
  createdAt?: string | null;
}

const isExpired = (expiresAt: string | null | undefined) =>
  !!expiresAt && new Date(expiresAt) < new Date();

/** Notes that other people have shared with the signed-in user. */
export async function getSharedWithMe(): Promise<{
  success: boolean;
  error?: string;
  notes: SharedListItem[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not signed in", notes: [] };

  // Service role — the reader can't read the owner's shared_notes/notes under RLS.
  const svc = createServiceRoleClient();

  const { data: readerRows } = await svc
    .from("shared_notes_readers")
    .select("shared_note")
    .eq("reader_id", user.id);

  const shareIds = (readerRows || []).map((r: any) => r.shared_note);
  if (shareIds.length === 0) return { success: true, notes: [] };

  const { data: shares } = await svc
    .from("shared_notes")
    .select("id, shortcode, note_id, note_owner_id, is_anonymous, storage, expires_at, created_at")
    .in("id", shareIds);

  const notes: SharedListItem[] = [];
  for (const s of (shares as any[]) || []) {
    if (isExpired(s.expires_at)) continue;

    let title = "Untitled";
    if (s.storage !== "redis") {
      const { data: n } = await svc.from("notes").select("title").eq("id", s.note_id).single();
      title = (n as any)?.title || "Untitled";
    }

    let owner = "Anonymous";
    if (!s.is_anonymous) {
      const { data: a } = await svc.from("authors").select("username").eq("id", s.note_owner_id).single();
      owner = (a as any)?.username || "Unknown";
    }

    notes.push({ shortcode: s.shortcode, title, owner, createdAt: s.created_at });
  }
  return { success: true, notes };
}

/** Notes the signed-in user has shared out. */
export async function getSharedByMe(): Promise<{
  success: boolean;
  error?: string;
  notes: SharedListItem[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not signed in", notes: [] };

  const svc = createServiceRoleClient();
  const { data: shares } = await svc
    .from("shared_notes")
    .select("id, shortcode, note_id, is_public, view_count, storage, expires_at")
    .eq("note_owner_id", user.id);

  const notes: SharedListItem[] = [];
  for (const s of (shares as any[]) || []) {
    let title = "Untitled";
    if (s.storage !== "redis") {
      const { data: n } = await svc.from("notes").select("title").eq("id", s.note_id).single();
      title = (n as any)?.title || "Untitled";
    }

    const { count } = await svc
      .from("shared_notes_readers")
      .select("id", { count: "exact", head: true })
      .eq("shared_note", s.id);

    notes.push({
      shortcode: s.shortcode,
      title,
      isPublic: s.is_public,
      viewCount: s.view_count || 0,
      readerCount: count || 0,
    });
  }
  return { success: true, notes };
}
