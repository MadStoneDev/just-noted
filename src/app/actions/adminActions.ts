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
  category: string | null;
  vote_count: number;
  created_at: string;
}

export async function getPendingSuggestions(): Promise<PendingSuggestion[]> {
  await assertAdmin();
  const svc = createServiceRoleClient();
  const { data } = await svc
    .from("roadmap_items")
    .select("id, title, body, category, vote_count, created_at")
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

// ---------------------------------------------------------------------------
// Users — list + quick actions (roles, Scribe comps). Retires the manual SQL.
// ---------------------------------------------------------------------------

export interface AdminUser {
  id: string;
  email: string;
  username: string | null;
  role: number;
  tier: "draft" | "scribe";
}

export async function getUsers(): Promise<AdminUser[]> {
  await assertAdmin();
  const svc = createServiceRoleClient();
  const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
  const users = list?.users ?? [];
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return [];

  const { data: authors } = await svc.from("authors").select("id, username, role").in("id", ids);
  const { data: subs } = await svc
    .from("subscriptions")
    .select("user_id, tier, status")
    .in("user_id", ids);

  const aById = new Map((authors ?? []).map((a: any) => [a.id, a]));
  const sByUser = new Map((subs ?? []).map((s: any) => [s.user_id, s]));

  return users
    .map((u) => {
      const a = aById.get(u.id) as any;
      const s = sByUser.get(u.id) as any;
      const isScribe =
        (s?.status === "active" || s?.status === "trialing") && s?.tier === "scribe";
      return {
        id: u.id,
        email: u.email ?? "",
        username: a?.username ?? null,
        role: typeof a?.role === "number" ? a.role : 3,
        tier: (isScribe ? "scribe" : "draft") as "draft" | "scribe",
      };
    })
    .sort((x, y) => (x.username || x.email).localeCompare(y.username || y.email));
}

export async function setUserRole(userId: string, role: number): Promise<{ success: boolean }> {
  await assertAdmin();
  const svc = createServiceRoleClient();
  const { error } = await svc.from("authors").update({ role } as any).eq("id", userId);
  return { success: !error };
}

/** Comp or revoke Scribe for a user (no Stripe involved — a manual grant). */
export async function setUserScribe(
  userId: string,
  active: boolean,
): Promise<{ success: boolean }> {
  await assertAdmin();
  const svc = createServiceRoleClient();
  if (active) {
    const { error } = await svc.from("subscriptions").upsert(
      { user_id: userId, tier: "scribe", status: "active", updated_at: new Date().toISOString() } as any,
      { onConflict: "user_id" },
    );
    return { success: !error };
  }
  // Revoke: only touches an existing row (no row = already free/draft).
  const { error } = await svc
    .from("subscriptions")
    .update({ tier: "draft", status: "cancelled", updated_at: new Date().toISOString() } as any)
    .eq("user_id", userId);
  return { success: !error };
}

// ---------------------------------------------------------------------------
// Roadmap items — manage the board directly (add/edit/restatus/reorder/delete).
// ---------------------------------------------------------------------------

export const ROADMAP_STATUSES = [
  "under_review",
  "planned",
  "in_progress",
  "shipped",
  "declined",
] as const;
export type RoadmapStatusValue = (typeof ROADMAP_STATUSES)[number];

export interface AdminRoadmapItem {
  id: string;
  title: string;
  body: string;
  status: string;
  source: string;
  category: string | null;
  is_public: boolean;
  vote_count: number;
  sort_order: number;
}

export async function getAllRoadmapItems(): Promise<AdminRoadmapItem[]> {
  await assertAdmin();
  const svc = createServiceRoleClient();
  const { data } = await svc
    .from("roadmap_items")
    .select("id, title, body, status, source, category, is_public, vote_count, sort_order")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  return (data ?? []) as AdminRoadmapItem[];
}

export interface RoadmapItemInput {
  title: string;
  body?: string;
  status?: RoadmapStatusValue;
  category?: "fix" | "feature" | null;
  is_public?: boolean;
  sort_order?: number;
}

export async function createRoadmapItem(
  fields: RoadmapItemInput,
): Promise<{ success: boolean; error?: string }> {
  await assertAdmin();
  const title = (fields.title || "").trim().slice(0, 120);
  if (!title) return { success: false, error: "Title is required." };
  const svc = createServiceRoleClient();
  const { error } = await svc.from("roadmap_items").insert({
    title,
    body: (fields.body || "").trim().slice(0, 2000),
    status: fields.status ?? "planned",
    source: "official",
    category: fields.category ?? null,
    is_public: fields.is_public ?? true,
    sort_order: fields.sort_order ?? 0,
  } as any);
  return { success: !error };
}

export async function updateRoadmapItem(
  id: string,
  fields: Partial<RoadmapItemInput>,
): Promise<{ success: boolean }> {
  await assertAdmin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.title !== undefined) patch.title = fields.title.trim().slice(0, 120);
  if (fields.body !== undefined) patch.body = fields.body.trim().slice(0, 2000);
  if (fields.status !== undefined) patch.status = fields.status;
  if (fields.category !== undefined) patch.category = fields.category;
  if (fields.is_public !== undefined) patch.is_public = fields.is_public;
  if (fields.sort_order !== undefined) patch.sort_order = fields.sort_order;
  const svc = createServiceRoleClient();
  const { error } = await svc.from("roadmap_items").update(patch as any).eq("id", id);
  return { success: !error };
}

export async function deleteRoadmapItem(id: string): Promise<{ success: boolean }> {
  await assertAdmin();
  const svc = createServiceRoleClient();
  const { error } = await svc.from("roadmap_items").delete().eq("id", id);
  return { success: !error };
}

// ---------------------------------------------------------------------------
// Notes — metadata list + trash/restore. Content view is intentionally omitted
// (users' private writing); add it later behind an explicit, audited action.
// ---------------------------------------------------------------------------

export interface AdminNote {
  id: string;
  title: string | null;
  owner: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  is_private: boolean | null;
}

export async function getNotes(query?: string): Promise<AdminNote[]> {
  await assertAdmin();
  const svc = createServiceRoleClient();
  let q = svc
    .from("notes")
    .select("id, title, author, updated_at, deleted_at, is_private")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (query && query.trim()) q = q.ilike("title", `%${query.trim()}%`);
  const { data: notes } = await q;
  const rows = (notes ?? []) as any[];

  const authorIds = [...new Set(rows.map((n) => n.author).filter(Boolean))];
  const nameById = new Map<string, string>();
  if (authorIds.length) {
    const { data: authors } = await svc.from("authors").select("id, username").in("id", authorIds);
    for (const a of (authors ?? []) as any[]) nameById.set(a.id, a.username);
  }

  return rows.map((n) => ({
    id: n.id,
    title: n.title,
    owner: nameById.get(n.author) ?? null,
    updated_at: n.updated_at,
    deleted_at: n.deleted_at,
    is_private: n.is_private,
  }));
}

export async function adminSetNoteDeleted(
  id: string,
  deleted: boolean,
): Promise<{ success: boolean }> {
  await assertAdmin();
  const svc = createServiceRoleClient();
  const { error } = await svc
    .from("notes")
    .update({ deleted_at: deleted ? new Date().toISOString() : null } as any)
    .eq("id", id);
  return { success: !error };
}
