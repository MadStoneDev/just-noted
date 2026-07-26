"use server";

import { createClient } from "@/utils/supabase/server";
import { Tag, TagRow, tagRowToTag } from "@/types/tag";

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.getUser();
  if (error || !authData.user?.id) {
    throw new Error("User not authenticated");
  }
  return { supabase, userId: authData.user.id };
}

export async function getTags(): Promise<{
  success: boolean;
  tags?: Tag[];
  error?: string;
}> {
  try {
    const { supabase } = await getAuthenticatedUser();
    const { data, error } = await supabase
      .from("tags")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;
    return {
      success: true,
      tags: (data as TagRow[]).map(tagRowToTag),
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createTag(input: {
  name: string;
  color?: string;
}): Promise<{ success: boolean; tag?: Tag; error?: string }> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const name = input.name.trim();
    if (!name || name.length > 50) {
      return { success: false, error: "Tag name must be 1-50 characters" };
    }

    const { data, error } = await supabase
      .from("tags")
      .insert({
        owner: userId,
        name,
        color: input.color || "#6366f1",
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "A tag with this name already exists" };
      }
      throw error;
    }
    return { success: true, tag: tagRowToTag(data as TagRow) };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateTag(
  id: string,
  updates: { name?: string; color?: string },
): Promise<{ success: boolean; tag?: Tag; error?: string }> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const updateData: Record<string, string> = {};
    if (updates.name !== undefined) {
      const name = updates.name.trim();
      if (!name || name.length > 50) {
        return { success: false, error: "Tag name must be 1-50 characters" };
      }
      updateData.name = name;
    }
    if (updates.color !== undefined) {
      updateData.color = updates.color;
    }

    const { data, error } = await supabase
      .from("tags")
      .update(updateData)
      .eq("id", id)
      .eq("owner", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "A tag with this name already exists" };
      }
      throw error;
    }
    return { success: true, tag: tagRowToTag(data as TagRow) };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteTag(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const { error } = await supabase
      .from("tags")
      .delete()
      .eq("id", id)
      .eq("owner", userId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Verify both the tag and the note belong to the caller before linking them.
 * Defends against IDOR if RLS on note_tags is ever misapplied.
 */
async function assertOwnsTagAndNote(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"],
  userId: string,
  noteId: string,
  tagId: string,
): Promise<boolean> {
  const [{ data: tag }, { data: note }] = await Promise.all([
    supabase.from("tags").select("id").eq("id", tagId).eq("owner", userId).maybeSingle(),
    supabase.from("notes").select("id").eq("id", noteId).eq("author", userId).maybeSingle(),
  ]);
  return !!tag && !!note;
}

export async function assignTagToNote(
  noteId: string,
  tagId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    if (!(await assertOwnsTagAndNote(supabase, userId, noteId, tagId))) {
      return { success: false, error: "Not found" };
    }
    const { error } = await supabase
      .from("note_tags")
      .upsert({ note_id: noteId, tag_id: tagId }, { onConflict: "note_id,tag_id" });
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function removeTagFromNote(
  noteId: string,
  tagId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    if (!(await assertOwnsTagAndNote(supabase, userId, noteId, tagId))) {
      return { success: false, error: "Not found" };
    }
    const { error } = await supabase
      .from("note_tags")
      .delete()
      .eq("note_id", noteId)
      .eq("tag_id", tagId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function bulkGetNoteTags(
  noteIds: string[],
): Promise<{
  success: boolean;
  noteTagMap?: Record<string, string[]>;
  error?: string;
}> {
  try {
    if (noteIds.length === 0) {
      return { success: true, noteTagMap: {} };
    }
    const { supabase } = await getAuthenticatedUser();
    const { data, error } = await supabase
      .from("note_tags")
      .select("note_id, tag_id")
      .in("note_id", noteIds);

    if (error) throw error;

    const map: Record<string, string[]> = {};
    for (const row of data || []) {
      if (!map[row.note_id]) map[row.note_id] = [];
      map[row.note_id].push(row.tag_id);
    }
    return { success: true, noteTagMap: map };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
