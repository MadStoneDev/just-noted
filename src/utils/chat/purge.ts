import "server-only";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { deletePrivateObject } from "@/utils/storage/r2-private";

/**
 * Deleted-user handling for chat. Call this from the account-deletion flow
 * BEFORE removing the auth user.
 *
 * Their message TEXT is kept (it renders as "Deleted user" once the
 * note_chat_messages.author_id FK nulls on auth-user deletion), preserving the
 * conversation for everyone else. Their uploaded MEDIA is deleted — it's storage
 * cost and personal data that should leave with the account — and the media
 * columns are cleared so nothing points at a gone object.
 *
 * Not a "use server" action (it takes a userId and must only be called
 * server-side by trusted code, never from a client).
 */
export async function purgeUserChatMedia(userId: string): Promise<void> {
  if (!userId) return;
  const svc = createServiceRoleClient();

  const { data } = await svc
    .from("note_chat_messages")
    .select("id, media_key")
    .eq("author_id", userId)
    .not("media_key", "is", null);

  const rows = (data as { id: string; media_key: string | null }[]) || [];
  if (rows.length === 0) return;

  for (const r of rows) {
    if (r.media_key) await deletePrivateObject(r.media_key);
  }

  await svc
    .from("note_chat_messages")
    .update({ media_key: null, media_mime: null, media_meta: null } as any)
    .eq("author_id", userId)
    .not("media_key", "is", null);
}
