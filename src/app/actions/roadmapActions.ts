"use server";

import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { cookies, headers } from "next/headers";
import crypto from "crypto";

// Guest voters are identified by a token in this cookie; members by user_id.
const VOTER_COOKIE = "jn_roadmap_voter";
const YEAR2 = 60 * 60 * 24 * 365 * 2;

export interface RoadmapBoardItem {
  id: string;
  title: string;
  body: string;
  status: string;
  vote_count: number;
  sort_order: number;
  voted: boolean;
}

async function currentVoter(): Promise<{ userId: string | null; voterKey: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const voterKey = cookieStore.get(VOTER_COOKIE)?.value ?? null;
  return { userId: user?.id ?? null, voterKey };
}

/** Public board: published items + whether the current viewer has voted for each. */
export async function getRoadmap(): Promise<RoadmapBoardItem[]> {
  const svc = createServiceRoleClient();
  const { data: items } = await svc
    .from("roadmap_items")
    .select("id, title, body, status, vote_count, sort_order")
    .eq("is_public", true)
    .order("sort_order", { ascending: true });

  const rows = (items ?? []) as Omit<RoadmapBoardItem, "voted">[];
  if (rows.length === 0) return [];

  const { userId, voterKey } = await currentVoter();
  let voted = new Set<string>();
  if (userId || voterKey) {
    let q = svc.from("roadmap_votes").select("item_id");
    q = userId ? q.eq("user_id", userId) : q.eq("voter_key", voterKey as string);
    const { data: votes } = await q;
    voted = new Set((votes ?? []).map((v: any) => v.item_id as string));
  }
  return rows.map((r) => ({ ...r, voted: voted.has(r.id) }));
}

/** Toggle the caller's vote on an item. Sets a guest cookie on first vote. */
export async function toggleVote(itemId: string): Promise<{ voted: boolean; count: number }> {
  const svc = createServiceRoleClient();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for") || "").split(",")[0].trim() || null;

  let voterKey = cookieStore.get(VOTER_COOKIE)?.value ?? null;
  if (!user && !voterKey) {
    voterKey = crypto.randomUUID();
    cookieStore.set(VOTER_COOKIE, voterKey, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: YEAR2,
      path: "/",
    });
  }

  let findQ = svc.from("roadmap_votes").select("id").eq("item_id", itemId);
  findQ = user ? findQ.eq("user_id", user.id) : findQ.eq("voter_key", voterKey as string);
  const { data: existing } = await findQ.maybeSingle();

  if (existing) {
    await svc.from("roadmap_votes").delete().eq("id", (existing as any).id);
  } else {
    await svc.from("roadmap_votes").insert({
      item_id: itemId,
      user_id: user?.id ?? null,
      voter_key: user ? null : voterKey,
      ip,
    } as any);
  }

  const { data: item } = await svc
    .from("roadmap_items")
    .select("vote_count")
    .eq("id", itemId)
    .maybeSingle();
  return { voted: !existing, count: (item as any)?.vote_count ?? 0 };
}

/** Submit a feature suggestion — hidden until an admin approves it. */
export async function submitSuggestion(
  title: string,
  body: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sign in to suggest a feature." };

  const t = (title || "").trim().slice(0, 120);
  const b = (body || "").trim().slice(0, 2000);
  if (!t) return { success: false, error: "Give your suggestion a title." };

  const svc = createServiceRoleClient();
  const { error } = await svc.from("roadmap_items").insert({
    title: t,
    body: b,
    status: "under_review",
    source: "community",
    is_public: false,
    created_by: user.id,
  } as any);
  if (error) return { success: false, error: "Couldn't submit — please try again." };
  return { success: true };
}
