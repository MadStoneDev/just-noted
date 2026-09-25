"use server";

import { createClient, createServiceRoleClient } from "@/utils/supabase/server";

// Admin access is authors.role >= 10 (see 20260925_author_role.sql). 3 = default
// user; lower values are reserved for moderation standing (warned/reported/banned).
export const ADMIN_ROLE = 10;

async function getSessionRole(): Promise<{ userId: string | null; role: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, role: 0 };
  // RLS lets a user read their own authors row, so the session client is enough.
  const { data } = await supabase
    .from("authors")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = typeof (data as any)?.role === "number" ? (data as any).role : 3;
  return { userId: user.id, role };
}

/** Cosmetic gate for rendering admin UI. The real gate is assertAdmin, server-side. */
export async function amIAdmin(): Promise<boolean> {
  const { role } = await getSessionRole();
  return role >= ADMIN_ROLE;
}

/**
 * Authorise an admin action. Returns the caller's user id, or throws if they are
 * not an admin. EVERY admin server action must call this first — never trust the
 * client to have hidden the UI.
 */
export async function assertAdmin(): Promise<string> {
  const { userId, role } = await getSessionRole();
  if (!userId || role < ADMIN_ROLE) {
    throw new Error("Not authorized");
  }
  return userId;
}

// ---------------------------------------------------------------------------
// Roadmap moderation (P4). Community suggestions land hidden; an admin approves
// (publishes) or declines them here instead of via SQL.
// ---------------------------------------------------------------------------

export interface PendingSuggestion {
  id: string;
  title: string;
  body: string;
  vote_count: number;
  created_at: string;
}

export async function getPendingSuggestions(): Promise<PendingSuggestion[]> {
  await assertAdmin();
  const svc = createServiceRoleClient();
  const { data } = await svc
    .from("roadmap_items")
    .select("id, title, body, vote_count, created_at")
    .eq("source", "community")
    .eq("is_public", false)
    .neq("status", "declined")
    .order("created_at", { ascending: false });
  return (data ?? []) as PendingSuggestion[];
}

export async function approveSuggestion(
  id: string,
  status: "under_review" | "planned" | "in_progress" | "shipped" = "planned",
): Promise<{ success: boolean }> {
  await assertAdmin();
  const svc = createServiceRoleClient();
  const { error } = await svc
    .from("roadmap_items")
    .update({ is_public: true, status, updated_at: new Date().toISOString() } as any)
    .eq("id", id);
  return { success: !error };
}

export async function declineSuggestion(id: string): Promise<{ success: boolean }> {
  await assertAdmin();
  const svc = createServiceRoleClient();
  const { error } = await svc
    .from("roadmap_items")
    .update({ status: "declined", is_public: false, updated_at: new Date().toISOString() } as any)
    .eq("id", id);
  return { success: !error };
}
