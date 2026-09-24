import { createServiceRoleClient } from "@/utils/supabase/server";
import { PHYSICAL_PURGE_DAYS } from "@/lib/retention";

const DAY = 86400000;

/**
 * Hard-delete soft-deleted notes whose deleted_at is older than
 * PHYSICAL_PURGE_DAYS. This is the backstop behind the per-tier retention
 * windows: because the cutoff sits beyond the largest window a user can pick,
 * no one loses a note the UI still shows them, and nothing lingers indefinitely.
 *
 * Invoked from the authenticated /api/admin/cleanup endpoint (cron-triggered).
 */
export async function purgeExpiredTrash() {
  try {
    const supabase = createServiceRoleClient();
    const cutoff = new Date(Date.now() - PHYSICAL_PURGE_DAYS * DAY).toISOString();

    const { data, error } = await supabase
      .from("notes")
      .delete()
      .not("deleted_at", "is", null)
      .lt("deleted_at", cutoff)
      .select("id");

    if (error) throw error;

    const purged = data?.length ?? 0;
    console.log(`Trash purge completed: removed ${purged} note(s) past ${PHYSICAL_PURGE_DAYS} days`);
    return { success: true, purged };
  } catch (error) {
    console.error("Trash purge failed:", error);
    return { success: false, error: String(error) };
  }
}
