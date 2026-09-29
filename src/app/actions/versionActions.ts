"use server";

import { createClient } from "@/utils/supabase/server";

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

    // Cap only the routine AUTOSAVE snapshots at 50 per note. Conflict / legacy /
    // transfer snapshots are rare and important — they are never pruned, so a
    // burst of conflicts can't push real edit history out of the window.
    if (reason === "autosave") {
      const { data: existing } = await supabase
        .from("note_versions")
        .select("id")
        .eq("note_id", noteId)
        .eq("author", userId)
        .eq("reason", "autosave")
        .order("created_at", { ascending: false });

      if (existing && existing.length >= 50) {
        const toDelete = existing.slice(49).map((v: any) => v.id);
        await supabase.from("note_versions").delete().in("id", toDelete);
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

export async function getVersions(noteId: string) {
  try {
    const { supabase, userId } = await getAuthenticatedUser();

    const { data, error } = await supabase
      .from("note_versions")
      .select("id, title, content, content_format, created_at")
      .eq("note_id", noteId)
      .eq("author", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return { success: true, versions: data || [] };
  } catch (error) {
    console.error("Failed to get versions:", error);
    return { success: true, versions: [] };
  }
}
