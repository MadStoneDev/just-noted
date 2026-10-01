import "server-only";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { purgeUserChatMedia } from "@/utils/chat/purge";
import { purgeUserExports } from "@/utils/account/export-runner";

type Svc = ReturnType<typeof createServiceRoleClient>;

// Best-effort single-column delete — one failure never blocks the rest (the
// cron re-runs, and every delete is idempotent).
async function del(svc: Svc, table: string, col: string, val: string): Promise<void> {
  try {
    await (svc.from(table as any).delete() as any).eq(col, val);
  } catch (e) {
    console.error(`[account purge] ${table}.${col} delete failed:`, e);
  }
}

/**
 * Hard-purge one account after its grace window. Idempotent/retryable: every
 * step tolerates already-gone data, so a partial failure is fixed by re-running.
 * The auth user is deleted LAST — that also nulls note_chat_messages.author_id
 * (their messages survive as "Deleted user").
 */
export async function purgeOneAccount(userId: string): Promise<void> {
  if (!userId) return;
  const svc = createServiceRoleClient();
  await svc.from("account_deletions").update({ status: "purging" } as any).eq("user_id", userId);

  // 1. Chat media + account export objects/rows from the private bucket.
  try { await purgeUserChatMedia(userId); } catch (e) { console.error("[account purge] chat media failed:", e); }
  try { await purgeUserExports(userId); } catch (e) { console.error("[account purge] exports failed:", e); }

  // 2. Remove them as an editor/viewer on OTHERS' notes.
  await del(svc, "shared_notes_readers", "reader_id", userId);

  // 3. Their OWN content. Shares first (cascades their readers), then notes
  //    (cascades note_ydoc / note_chat_messages / note_chat_reads by note_id).
  await del(svc, "shared_notes", "note_owner_id", userId);
  await del(svc, "note_versions", "author", userId);
  await del(svc, "notes", "author", userId);
  await del(svc, "notebooks", "owner", userId);
  await del(svc, "tags", "owner", userId);
  await del(svc, "collections", "owner", userId);

  // 4. Their per-user rows on things that may still exist.
  await del(svc, "note_chat_reads", "user_id", userId);
  await del(svc, "saved_shared_notes", "user_id", userId);
  await del(svc, "writing_sessions", "user_id", userId);
  await del(svc, "roadmap_votes", "user_id", userId);
  await del(svc, "notifications", "user_id", userId);
  await del(svc, "user_settings", "user_id", userId);
  await del(svc, "subscriptions", "user_id", userId);

  // 5. Profile row.
  await del(svc, "authors", "id", userId);

  // 6. Auth user LAST.
  try {
    await (svc as any).auth.admin.deleteUser(userId);
  } catch (e) {
    console.error("[account purge] auth.deleteUser failed:", e);
  }

  await svc.from("account_deletions").update({ status: "done" } as any).eq("user_id", userId);
}

/** Delete completed deletion records older than 12 months (audit retention). */
export async function purgeOldDeletionRecords(): Promise<{ success: boolean; removed: number }> {
  try {
    const svc = createServiceRoleClient();
    const cutoff = new Date(Date.now() - 365 * 86400000).toISOString();
    const { error, count } = await svc
      .from("account_deletions")
      .delete({ count: "exact" })
      .eq("status", "done")
      .lte("requested_at", cutoff);
    if (error) return { success: false, removed: 0 };
    return { success: true, removed: count ?? 0 };
  } catch {
    return { success: false, removed: 0 };
  }
}

/** Purge every account whose grace window has elapsed (called by the cron). */
export async function purgeDueAccounts(): Promise<{ success: boolean; purged: number }> {
  const svc = createServiceRoleClient();
  const { data, error } = await svc
    .from("account_deletions")
    .select("user_id")
    .eq("status", "pending")
    .lte("purge_at", new Date().toISOString());
  if (error) {
    console.error("[account purge] listing due accounts failed:", error);
    return { success: false, purged: 0 };
  }
  const rows = (data as { user_id: string }[]) || [];
  let purged = 0;
  for (const r of rows) {
    await purgeOneAccount(r.user_id);
    purged += 1;
  }
  return { success: true, purged };
}
