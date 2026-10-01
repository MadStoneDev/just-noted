"use server";

import { createClient } from "@/utils/supabase/server";
import { sanitizeNotificationPrefs, type ChannelPref } from "@/lib/notifications";

// user_settings holds only non-privileged preferences (notification frequencies
// + editor prefs). Plan-gated values are never stored or read here.

export interface UserSettings {
  notifications: Record<string, ChannelPref>;
  editor: { spellcheck: boolean };
}

const DEFAULT_EDITOR = { spellcheck: true };

function sanitizeEditor(input: unknown): { spellcheck: boolean } {
  const i = (input ?? {}) as any;
  return { spellcheck: typeof i.spellcheck === "boolean" ? i.spellcheck : DEFAULT_EDITOR.spellcheck };
}

export async function getUserSettings(): Promise<UserSettings> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { notifications: {}, editor: { ...DEFAULT_EDITOR } };
  const { data } = await supabase.from("user_settings").select("settings").eq("user_id", user.id).maybeSingle();
  const s = ((data as any)?.settings ?? {}) as any;
  return {
    notifications: sanitizeNotificationPrefs(s.notifications),
    editor: sanitizeEditor(s.editor),
  };
}

// Merge a partial update into the stored settings (server-side sanitised).
async function writeSettings(patch: (current: any) => any): Promise<{ success: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  const { data } = await supabase.from("user_settings").select("settings").eq("user_id", user.id).maybeSingle();
  const current = ((data as any)?.settings ?? {}) as any;
  const next = patch(current);
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, settings: next, updated_at: new Date().toISOString() } as any, { onConflict: "user_id" });
  return { success: !error };
}

export async function updateNotificationPrefs(prefs: unknown): Promise<{ success: boolean }> {
  const clean = sanitizeNotificationPrefs(prefs);
  return writeSettings((current) => ({ ...current, notifications: clean }));
}

export async function updateEditorPrefs(prefs: unknown): Promise<{ success: boolean }> {
  const clean = sanitizeEditor(prefs);
  return writeSettings((current) => ({ ...current, editor: clean }));
}
