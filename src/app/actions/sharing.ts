"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { getCollabAllowance } from "@/lib/subscription";
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
      // Link permission level (design surface 04): 'off' | 'view' | 'edit' | 'published'.
      linkPermission?: "off" | "view" | "edit" | "published";
      // Role for a person added by username/email: 'view' | 'edit'.
      role?: "view" | "edit";
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
  | { operation: "stopSharing"; noteId: string; currentUserId: string }
  | {
      operation: "saveSharedNote";
      shortcode: string;
      title: string;
      content: string;
      contentFormat?: string;
      currentUserId: string;
    };

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

  // Security: an authenticated session always wins. The client-supplied
  // `currentUserId` is only trusted for the anonymous (Redis) tier, whose users
  // legitimately have no session and whose LocalStorage token *is* their
  // identity. Never let an unauthenticated caller act on a Supabase-backed share
  // by passing someone else's user id.
  const resolveOwnerId = (
    currentUserId: string | null | undefined,
    storage: "redis" | "supabase",
  ): string | null => {
    if (authenticatedUserId) return authenticatedUserId;
    return storage === "redis" ? currentUserId ?? null : null;
  };

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
          linkPermission,
        } = params;

        // Link permission level (design surface 04). When provided it is
        // authoritative; is_public stays in sync for backward compatibility.
        // 'edit'/'published' plumb through here but the edit write path and the
        // public listing are enforced elsewhere.
        const resolvedPermission: string =
          (linkPermission as string | undefined) ?? (isPublic ? "view" : "off");
        const resolvedPublic =
          linkPermission !== undefined ? resolvedPermission !== "off" : isPublic;

        // Use server-side auth for ownership — more reliable than client-passed ID.
        // For Supabase-backed notes a real session is required; the anonymous
        // Redis tier falls back to the client's LocalStorage token.
        const ownerId = resolveOwnerId(currentUserId, storage);

        if (!ownerId) {
          return {
            success: false,
            error: "You must be signed in to share this note",
          };
        }

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

        // Collaboration is a paid capability. A "Can edit" link, or adding a
        // person as an editor, both require it — enforced server-side.
        const wantsEditLink = resolvedPermission === "edit";
        const wantsEditor = username && params.role === "edit";
        if (wantsEditLink || wantsEditor) {
          const { canCollaborate, maxCollaborators } = await getCollabAllowance(supabase, ownerId);
          if (!canCollaborate) {
            return { success: false, error: "UPGRADE_REQUIRED", reason: "collaborate" } as any;
          }
          // Cap the number of named editors on this note (maxCollaborators, -1 = ∞).
          if (wantsEditor && maxCollaborators >= 0) {
            const svc2 = createServiceRoleClient();
            const { data: shareRow } = await svc2
              .from("shared_notes")
              .select("id")
              .eq("note_id", noteId)
              .eq("note_owner_id", ownerId)
              .maybeSingle();
            if (shareRow) {
              const { data: editorRows } = await svc2
                .from("shared_notes_readers")
                .select("reader_username, role")
                .eq("shared_note", (shareRow as any).id);
              const editors = (editorRows || []).filter((r: any) => r.role === "edit");
              const already = editors.some((r: any) => r.reader_username?.toLowerCase() === username!.trim().toLowerCase());
              if (!already && editors.length >= maxCollaborators) {
                return { success: false, error: "COLLAB_LIMIT", reason: "maxCollaborators", limit: maxCollaborators } as any;
              }
            }
          }
        }

        // Check existing shares
        const { data: existingShares } = await supabase
          .from("shared_notes")
          .select("id, shortcode")
          .eq("note_id", noteId)
          .eq("note_owner_id", ownerId);

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
              is_public: resolvedPublic,
              storage,
              is_anonymous: isAnonymous,
              password_hash: passwordHash,
              expires_at: expiresAt,
              link_permission: resolvedPermission,
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

          // Only rewrite link settings when this call is a link save (no
          // username). Adding a named reader must not silently flip the link
          // state — that path falls straight through to the reader insert.
          if (!username) {
            const updateData: Record<string, any> = {
              is_public: resolvedPublic,
              is_anonymous: isAnonymous,
              expires_at: expiresAt,
              link_permission: resolvedPermission,
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
              .eq("note_owner_id", ownerId);

            if (updateError) {
              return { success: false, error: "Failed to update share" };
            }
          }
        }

        // Handle specific user sharing. `authors` and `shared_notes_readers`
        // are intentionally not cross-user readable/writable under RLS, so the
        // username lookup and reader insert must go through the service-role
        // client (the anon/authenticated client can only see the caller's own
        // author row, which is why this returned "Username not found").
        if (username) {
          const svc = createServiceRoleClient();
          const identifier = username.trim();
          const readerRole = params.role === "edit" ? "edit" : "view";

          // Resolve the person by email (auth.users, via a SECURITY DEFINER
          // function) or by username (authors). auth.users isn't reachable over
          // PostgREST, so email must go through the RPC.
          let readerId: string | null = null;
          let canonicalUsername = identifier;
          if (identifier.includes("@")) {
            const { data: uid } = await (svc.rpc as any)("author_id_by_email", { p_email: identifier });
            readerId = (uid as string) || null;
            if (!readerId) {
              return { success: false, error: "No JustNoted account uses that email" };
            }
            const { data: a } = await svc.from("authors").select("username").eq("id", readerId).maybeSingle();
            canonicalUsername = (a as any)?.username || identifier;
          } else {
            const { data: userData } = await svc
              .from("authors")
              .select("id, username")
              .ilike("username", identifier)
              .maybeSingle();
            if (!userData) {
              return { success: false, error: "No account with that username" };
            }
            readerId = (userData as any).id;
            canonicalUsername = (userData as any).username;
          }

          // Already has access? Just update their role.
          const { data: existingReaders } = await svc
            .from("shared_notes_readers")
            .select("id")
            .eq("shared_note", shareId)
            .eq("reader_id", readerId)
            .maybeSingle();

          if (existingReaders) {
            await svc
              .from("shared_notes_readers")
              .update({ role: readerRole } as any)
              .eq("id", (existingReaders as any).id);
            return { success: true, shortcode, message: "Access updated" };
          }

          // Add reader — store the canonical username so access checks in
          // getByShortcode (which compare against authors.username) line up.
          const { error: insertReaderError } = await svc
            .from("shared_notes_readers")
            .insert({
              shared_note: shareId,
              reader_username: canonicalUsername,
              reader_id: readerId,
              role: readerRole,
            } as any);

          if (insertReaderError) {
            return { success: false, error: "Failed to share with user" };
          }
        }

        // No revalidatePath here: the share sheet refetches its own state, and
        // refreshing "/" mid-session can remount the shell into the error
        // boundary (same failure the avatar save hit).
        return { success: true, shortcode };
      }

      case "getUsers": {
        const { noteId, currentUserId } = params;

        // The owner's collaboration allowance — the sheet uses it to gate the
        // "Can edit" options in the UI (also enforced server-side on save).
        const allowance = authenticatedUserId
          ? await getCollabAllowance(supabase, authenticatedUserId)
          : { canCollaborate: false, maxCollaborators: 0 };

        let getUsersQuery = supabase
          .from("shared_notes")
          .select("id, shortcode, is_public, storage, is_anonymous, password_hash, expires_at, view_count, link_permission")
          .eq("note_id", noteId)
          .eq("note_owner_id", authenticatedUserId || currentUserId);
        // Without a session, only the anonymous (Redis) tier may be managed via
        // the client token — never a Supabase-backed share.
        if (!authenticatedUserId) getUsersQuery = getUsersQuery.eq("storage", "redis");
        const { data: shareData } = await getUsersQuery.single();

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
            linkPermission: "off",
            canCollaborate: allowance.canCollaborate,
            maxCollaborators: allowance.maxCollaborators,
          };
        }

        const { data: readersData } = await supabase
          .from("shared_notes_readers")
          .select("reader_username, role")
          .eq("shared_note", shareData.id);

        const users =
          readersData?.map((reader: any) => ({
            username: reader.reader_username,
            role: reader.role || "view",
          })) || [];

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
          linkPermission: (shareData as any).link_permission || ((shareData as any).is_public ? "view" : "off"),
          canCollaborate: allowance.canCollaborate,
          maxCollaborators: allowance.maxCollaborators,
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
        const linkPermission: string =
          (shareData as any).link_permission || (shareData.is_public ? "view" : "off");
        // The viewer's own per-person role, if they were added as a reader.
        let viewerRole: string | null = null;
        if (authenticatedUserId) {
          const { data: r } = await serviceClient
            .from("shared_notes_readers")
            .select("role")
            .eq("shared_note", shareData.id)
            .eq("reader_id", authenticatedUserId)
            .maybeSingle();
          viewerRole = (r as any)?.role ?? null;
        }
        // A signed-in visitor may edit a Supabase-backed note when the link is
        // set to "Can edit", or when they were added as an editor. Anonymous
        // editing is not supported and the Redis tier is view-only. Re-checked
        // on save.
        const canEdit =
          (linkPermission === "edit" || viewerRole === "edit") &&
          !!authenticatedUserId &&
          storage === "supabase";

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

        // Never expose the note owner's id to viewers. For the anonymous (Redis)
        // tier this id IS the LocalStorage capability token — leaking it would let
        // any viewer read or destroy all of that owner's notes. Viewers only need
        // the display fields (authorUsername / authorAvatar) resolved above.
        const { author: _ownerId, ...safeNote } =
          noteResult.note as typeof noteResult.note & { author?: string };

        return {
          success: true,
          note: {
            ...safeNote,
            authorUsername: authorInfo.username,
            authorAvatar: isAnonymous ? null : authorInfo.avatar_url,
            content_format: (noteResult.note as any).content_format,
            canEdit,
            shareInfo: {
              shortcode: shareData.shortcode,
              isPublic: shareData.is_public,
              isAnonymous,
              storage: shareData.storage,
              createdAt: shareData.created_at,
              viewCount: shareData.view_count || 0,
              linkPermission,
              canEdit,
            },
          },
        };
      }

      case "saveSharedNote": {
        const { shortcode, title, content, contentFormat, currentUserId } = params;

        // Anonymous editing is not supported — a real session is required.
        if (!authenticatedUserId) {
          return { success: false, error: "You need to sign in to edit this note" };
        }

        const svc = createServiceRoleClient();
        const { data: shareData, error: shareErr } = await svc
          .from("shared_notes")
          .select("id, note_id, storage, link_permission, expires_at")
          .eq("shortcode", shortcode)
          .single();

        if (shareErr || !shareData) {
          return { success: false, error: "Shared note not found" };
        }
        // Enforce edit access server-side: either the link allows editing, or
        // this person was added as an editor.
        let mayEdit = (shareData as any).link_permission === "edit";
        if (!mayEdit) {
          const { data: r } = await svc
            .from("shared_notes_readers")
            .select("role")
            .eq("shared_note", (shareData as any).id)
            .eq("reader_id", authenticatedUserId)
            .maybeSingle();
          mayEdit = (r as any)?.role === "edit";
        }
        if (!mayEdit) {
          return { success: false, error: "You don't have edit access to this note" };
        }
        if ((shareData as any).storage && (shareData as any).storage !== "supabase") {
          return { success: false, error: "This note can't be edited here" };
        }
        if ((shareData as any).expires_at && new Date((shareData as any).expires_at) < new Date()) {
          return { success: false, error: "This shared link has expired" };
        }

        const { error: updateErr } = await svc
          .from("notes")
          .update({
            title: title ?? "",
            content: content ?? "",
            content_format: contentFormat || "markdown",
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", (shareData as any).note_id);

        if (updateErr) {
          return { success: false, error: "Couldn't save your changes" };
        }

        // Best-effort attribution: record a version for the owner's history.
        try {
          await svc.from("note_versions").insert({
            note_id: (shareData as any).note_id,
            author: authenticatedUserId,
            title: title ?? "",
            content: content ?? "",
            content_format: contentFormat || "markdown",
          } as any);
        } catch {}

        return { success: true };
      }

      case "removeUser": {
        const { noteId, username, currentUserId } = params;

        let removeUserQuery = supabase
          .from("shared_notes")
          .select("id")
          .eq("note_id", noteId)
          .eq("note_owner_id", authenticatedUserId || currentUserId);
        if (!authenticatedUserId) removeUserQuery = removeUserQuery.eq("storage", "redis");
        const { data: shareData } = await removeUserQuery.single();

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

        let stopSharingQuery = supabase
          .from("shared_notes")
          .delete()
          .eq("note_id", noteId)
          .eq("note_owner_id", authenticatedUserId || currentUserId);
        if (!authenticatedUserId) stopSharingQuery = stopSharingQuery.eq("storage", "redis");
        const { error } = await stopSharingQuery;

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

export type SharedSource = "owned" | "granted" | "saved";

export interface SharedListItem {
  shortcode: string;
  title: string;
  /** "owned" = shared by you, "granted" = shared with you, "saved" = added by you via a link. */
  source: SharedSource;
  /** Owner username (for granted/saved) — "Anonymous" when the share hides it. */
  owner?: string;
  /** Owner avatar URL (for granted/saved), when not anonymous. */
  ownerAvatar?: string | null;
  /** Link permission level: 'off' | 'view' | 'edit' | 'published'. */
  linkPermission?: string;
  /** True when the user bookmarked this via a link (so it's removable). */
  saved?: boolean;
  /** For owned shares. */
  isPublic?: boolean;
  viewCount?: number;
  readerCount?: number;
  createdAt?: string | null;
}

const isExpired = (expiresAt: string | null | undefined) =>
  !!expiresAt && new Date(expiresAt) < new Date();

/** Pull a shortcode out of a full share URL, a /n/<code> path, or a bare code. */
function extractShortcode(input: string): string | null {
  const trimmed = (input || "").trim();
  if (!trimmed) return null;
  const viaPath = trimmed.match(/\/n\/([A-Za-z0-9]{6,20})/);
  if (viaPath) return viaPath[1];
  if (/^[A-Za-z0-9]{6,20}$/.test(trimmed)) return trimmed;
  const lastSeg = trimmed.match(/\/([A-Za-z0-9]{6,20})\/?(?:[?#].*)?$/);
  if (lastSeg) return lastSeg[1];
  return null;
}

/**
 * Notes the signed-in user can view but doesn't own:
 *   - "granted" — an owner added them as a reader (shared_notes_readers)
 *   - "saved"   — they bookmarked a link themselves (saved_shared_notes)
 * A note that's both counts as "granted".
 */
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

  // (a) owner-granted shares (via reader rows) — keep each grant's role so the
  // list can show the viewer's OWN access, not the link's.
  const { data: readerRows } = await svc
    .from("shared_notes_readers")
    .select("shared_note, role")
    .eq("reader_id", user.id);
  const readerShareIds = (readerRows || []).map((r: any) => r.shared_note);
  const roleByShareId = new Map<string, string>(
    (readerRows || []).map((r: any) => [r.shared_note, r.role || "view"]),
  );

  const grantedSet = new Set<string>();
  if (readerShareIds.length > 0) {
    const { data } = await svc
      .from("shared_notes")
      .select("shortcode")
      .in("id", readerShareIds);
    (data || []).forEach((s: any) => grantedSet.add(s.shortcode));
  }

  // (b) saved-by-link bookmarks
  const { data: savedRows } = await svc
    .from("saved_shared_notes")
    .select("shortcode")
    .eq("user_id", user.id);
  const savedSet = new Set<string>((savedRows || []).map((r: any) => r.shortcode));

  const allShortcodes = Array.from(new Set<string>([...grantedSet, ...savedSet]));
  if (allShortcodes.length === 0) return { success: true, notes: [] };

  const { data: shares } = await svc
    .from("shared_notes")
    .select("id, shortcode, note_id, note_owner_id, is_anonymous, storage, expires_at, created_at, link_permission")
    .in("shortcode", allShortcodes);

  const notes: SharedListItem[] = [];
  for (const s of (shares as any[]) || []) {
    if (isExpired(s.expires_at)) continue;

    let title = "Untitled";
    if (s.storage !== "redis") {
      const { data: n } = await svc.from("notes").select("title").eq("id", s.note_id).single();
      title = (n as any)?.title || "Untitled";
    }

    let owner = "Anonymous";
    let ownerAvatar: string | null = null;
    if (!s.is_anonymous) {
      const { data: a } = await svc.from("authors").select("username, avatar_url").eq("id", s.note_owner_id).single();
      owner = (a as any)?.username || "Unknown";
      ownerAvatar = (a as any)?.avatar_url || null;
    }

    const granted = grantedSet.has(s.shortcode);
    const linkPerm = s.link_permission || (s.is_public ? "view" : "off");
    // For a granted note the reader cares about THEIR access: edit if the link
    // grants edit or they were personally made an editor, else view.
    const viewerPerm = granted
      ? (linkPerm === "edit" || roleByShareId.get(s.id) === "edit" ? "edit" : "view")
      : linkPerm;
    notes.push({
      shortcode: s.shortcode,
      title,
      owner,
      ownerAvatar,
      linkPermission: viewerPerm,
      createdAt: s.created_at,
      source: granted ? "granted" : "saved",
      saved: savedSet.has(s.shortcode) && !granted,
    });
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
    .select("id, shortcode, note_id, is_public, view_count, storage, expires_at, link_permission")
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
      source: "owned",
      isPublic: s.is_public,
      linkPermission: s.link_permission || (s.is_public ? "view" : "off"),
      viewCount: s.view_count || 0,
      readerCount: count || 0,
    });
  }
  return { success: true, notes };
}

export interface SaveLinkResult {
  input: string;
  success: boolean;
  title?: string;
  shortcode?: string;
  error?: string;
}

/**
 * Validate one link/code and bookmark it. Runs the full ladder of checks:
 * is it a link/code, does it resolve to a JustNoted share, does that share
 * exist, is it expired, do you have access, is it your own note.
 */
async function resolveAndSaveLink(
  svc: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  viewerUsername: string | null,
  rawLink: string,
): Promise<SaveLinkResult> {
  const input = (rawLink || "").trim();
  if (!input) return { input, success: false, error: "Empty line." };

  const shortcode = extractShortcode(input);
  if (!shortcode) {
    return { input, success: false, error: "Not a JustNoted share link or code." };
  }

  const { data: share } = await svc
    .from("shared_notes")
    .select("id, note_id, note_owner_id, is_public, storage, expires_at")
    .eq("shortcode", shortcode)
    .single();
  if (!share) return { input, success: false, error: "No shared note found for that." };
  if (isExpired((share as any).expires_at)) {
    return { input, success: false, error: "That link has expired." };
  }
  if ((share as any).note_owner_id === userId) {
    return { input, success: false, error: "You own this note." };
  }

  if (!(share as any).is_public) {
    const reader = viewerUsername
      ? (
          await svc
            .from("shared_notes_readers")
            .select("id")
            .eq("shared_note", (share as any).id)
            .eq("reader_username", viewerUsername)
            .maybeSingle()
        ).data
      : null;
    if (!reader) return { input, success: false, error: "You don't have access to this note." };
  }

  const { error: insertErr } = await svc
    .from("saved_shared_notes")
    .upsert({ user_id: userId, shortcode }, { onConflict: "user_id,shortcode", ignoreDuplicates: true });
  if (insertErr) {
    console.error("saveSharedNote insert failed:", insertErr);
    return { input, success: false, error: "Couldn't save that note." };
  }

  let title = "Shared note";
  if ((share as any).storage !== "redis") {
    const { data: n } = await svc.from("notes").select("title").eq("id", (share as any).note_id).single();
    title = (n as any)?.title || "Untitled";
  }
  return { input, success: true, title, shortcode };
}

/** Bookmark a single shared note by link/code. */
export async function saveSharedNoteByLink(
  link: string,
): Promise<{ success: boolean; error?: string; title?: string; shortcode?: string }> {
  const res = await saveSharedNotesByLinks([link]);
  const r = res.results[0];
  if (!r) return { success: false, error: res.error || "Couldn't add that." };
  return { success: r.success, error: r.error, title: r.title, shortcode: r.shortcode };
}

/** Bookmark many shared notes at once — one link or code per entry. */
export async function saveSharedNotesByLinks(
  links: string[],
): Promise<{ success: boolean; results: SaveLinkResult[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, results: [], error: "You need to be signed in." };

  const svc = createServiceRoleClient();
  const { data: viewerAuthor } = await svc
    .from("authors")
    .select("username")
    .eq("id", user.id)
    .single();
  const viewerUsername = (viewerAuthor as any)?.username ?? null;

  const results: SaveLinkResult[] = [];
  for (const link of links) {
    results.push(await resolveAndSaveLink(svc, user.id, viewerUsername, link));
  }

  revalidatePath("/");
  return { success: true, results };
}

/** Remove a bookmarked (added-by-link) shared note from the user's list. */
export async function unsaveSharedNote(
  shortcode: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not signed in" };

  const { error } = await supabase
    .from("saved_shared_notes")
    .delete()
    .eq("user_id", user.id)
    .eq("shortcode", shortcode);
  if (error) return { success: false, error: "Couldn't remove that." };

  revalidatePath("/");
  return { success: true };
}
