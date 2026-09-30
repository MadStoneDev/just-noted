"use server";

import { Client } from "@upstash/qstash";
import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { checkRateLimit } from "@/utils/rate-limit";
import { processExport } from "@/utils/account/export-runner";
import { presignGet } from "@/utils/storage/r2-private";

export interface AccountExportItem {
  id: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  sizeBytes: number | null;
}

/** Start a full account export. Runs as a QStash background job when
 *  configured, otherwise inline. One active export at a time. */
export async function requestAccountExport(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You're not signed in." };

  const svc = createServiceRoleClient();

  const { data: active } = await svc
    .from("account_exports")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["pending", "processing"])
    .limit(1);
  if (active && (active as any[]).length > 0) {
    return { success: false, error: "An export is already being prepared." };
  }

  const rl = await checkRateLimit(user.id, "account-export", 5, 24 * 60 * 60 * 1000);
  if (!rl.allowed) return { success: false, error: "You've requested too many exports today." };

  const { data: row, error } = await svc
    .from("account_exports")
    .insert({ user_id: user.id, status: "pending" } as any)
    .select("id")
    .single();
  if (error || !row) return { success: false, error: "Couldn't start the export." };
  const exportId = (row as any).id as string;

  const token = process.env.QSTASH_TOKEN;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.EXPORT_JOB_SECRET;
  if (token && appUrl && secret) {
    try {
      const qstash = new Client({ token });
      await qstash.publishJSON({
        url: `${appUrl.replace(/\/+$/, "")}/api/export/process`,
        body: { exportId },
        headers: { Authorization: `Bearer ${secret}` },
      });
      return { success: true };
    } catch (e) {
      console.error("[export] enqueue failed, running inline:", e);
    }
  }
  // Inline fallback (also when QStash isn't configured).
  await processExport(exportId);
  return { success: true };
}

/** The user's recent exports (for the Settings list). */
export async function getAccountExports(): Promise<AccountExportItem[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("account_exports")
    .select("id, status, created_at, expires_at, size_bytes")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);
  return ((data as any[]) || []).map((r) => ({
    id: r.id,
    status: r.status,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    sizeBytes: r.size_bytes,
  }));
}

/** A short-lived presigned download URL for a ready, unexpired export. */
export async function getExportDownloadUrl(exportId: string): Promise<{ ok: boolean; url?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const svc = createServiceRoleClient();
  const { data } = await svc
    .from("account_exports")
    .select("user_id, status, storage_key, expires_at")
    .eq("id", exportId)
    .maybeSingle();
  const r = data as any;
  if (!r || r.user_id !== user.id || r.status !== "ready" || !r.storage_key) return { ok: false };
  if (r.expires_at && new Date(r.expires_at) < new Date()) return { ok: false };
  try {
    const url = await presignGet(r.storage_key);
    return { ok: true, url };
  } catch {
    return { ok: false };
  }
}
