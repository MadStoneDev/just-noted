"use server";

import { createClient, createServiceRoleClient } from "@/utils/supabase/server";

/**
 * Make sure the signed-in user has an author row, creating one with a random
 * username if it's missing (the signup trigger normally does this). Always
 * acts on the session's own user id — the underlying function is service-role
 * only, so the browser can't create author rows for other ids.
 */
export async function ensureOwnAuthor(): Promise<
  { success: true; author: { id: string; username: string | null } } | { success: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You're not signed in." };

  const svc = createServiceRoleClient();
  const { data, error } = await (svc.rpc as any)("create_author_with_random_username", { user_id: user.id });
  if (error || !data) return { success: false, error: "Couldn't create your profile." };
  const row = data as { id: string; username: string | null };
  return { success: true, author: { id: row.id, username: row.username } };
}
