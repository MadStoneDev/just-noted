"use server";

import { createClient } from "@/utils/supabase/server";
import { getUserTier } from "@/lib/subscription";
import { PLANS } from "@/lib/plans";

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) throw new Error("Not authenticated");
  return { supabase, userId: data.user.id };
}

export async function saveVersion(
  noteId: string,
  title: string,
  content: string,
  contentFormat: string = "markdown",
  reason: "autosave" | "conflict" | "legacy" | "transfer" = "autosave",
  noteVersion?: number,
) {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    // Cap only the routine AUTOSAVE snapshots, by plan (50 Draft / 200 Scribe).
    // Conflict / legacy / transfer snapshots are rare and important — they are
    // never pruned, so a burst of conflicts can't push real edit history out of
    // the window. On downgrade the cap simply drops, so a former Scribe's oldest
    // autosaves are trimmed back toward 50 gradually as new autosaves arrive
    // (nothing is deleted up front).
    if (reason === "autosave") {
      const tier = await getUserTier(supabase, userId);
      const cap = PLANS[tier].limits.autosaveVersionCap;

      const { data: existing } = await supabase
        .from("note_versions")
        .select("id")
        .eq("note_id", noteId)
        .eq("author", userId)
        .eq("reason", "autosave")
        .order("created_at", { ascending: false });

      if (existing && existing.length >= cap) {
        // Keep the newest (cap - 1); the incoming insert makes it exactly cap.
        const toDelete = existing.slice(cap - 1).map((v: any) => v.id);
        if (toDelete.length > 0) {
          await supabase.from("note_versions").delete().in("id", toDelete);
        }
      }
    }

    const { error } = await supabase.from("note_versions").insert({
      note_id: noteId,
      author: userId,
      title,
      content,
      content_format: contentFormat,
      reason,
      note_version: noteVersion ?? null,
    });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error("Failed to save version:", error);
    return { success: false };
  }
}

export async function getVersions(
  noteId: string,
  range?: { from?: string | null; to?: string | null },
) {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const tier = await getUserTier(supabase, userId);
    const plan = PLANS[tier];
    // The date/time range filter is a Scribe feature. Draft users still see all
    // of their versions (up to the cap); a range passed by a non-Scribe is
    // ignored server-side so the feature can't be used off-plan.
    const canFilter = plan.features.versionHistoryRangeFilter;

    let query = supabase
      .from("note_versions")
      .select("id, title, content, content_format, created_at")
      .eq("note_id", noteId)
      .eq("author", userId)
      .order("created_at", { ascending: false })
      .limit(plan.limits.autosaveVersionCap);

    if (canFilter && range?.from) query = query.gte("created_at", range.from);
    if (canFilter && range?.to) query = query.lte("created_at", range.to);

    const { data, error } = await query;

    if (error) throw error;
    return { success: true, versions: data || [], canFilter };
  } catch (error) {
    console.error("Failed to get versions:", error);
    return { success: true, versions: [], canFilter: false };
  }
}
