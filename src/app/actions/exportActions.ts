"use server";

import { Client } from "@upstash/qstash";
import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { checkRateLimit } from "@/utils/rate-limit";
import { processExport } from "@/utils/account/export-runner";
import { presignGet } from "@/utils/storage/r2-private";

export type ExportFormat = "json" | "markdown_zip";

export interface AccountExportItem {
  id: string;
  format: ExportFormat;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  sizeBytes: number | null;
}

/**
 * Start a full account export (JSON, or a zip of Markdown). Includes the
 * requesting browser's local notes when anonId is given. Limited to one export
 * per 48 hours. Runs as a signed QStash job when configured, otherwise inline.
 */
export async function requestAccountExport(
  format: ExportFormat,
  anonId?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You're not signed in." };
  const fmt: ExportFormat = format === "markdown_zip" ? "markdown_zip" : "json";

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

  const rl = await checkRateLimit(user.id, "account-export", 1, 48 * 60 * 60 * 1000);
  if (!rl.allowed) return { success: false, error: "You can request one export every 48 hours." };

  const { data: row, error } = await svc
    .from("account_exports")
    .insert({ user_id: user.id, status: "pending", format: fmt, anon_id: anonId ?? null } as any)
    .select("id")
    .single();
  if (error || !row) return { success: false, error: "Couldn't start the export." };
  const exportId = (row as any).id as string;

  const token = process.env.QSTASH_TOKEN;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  // Only enqueue when the worker can verify the signature too — otherwise the
  // job would be rejected and the export would stay stuck. Fall back to inline.
  const canVerify = !!(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY);
  if (token && appUrl && canVerify) {
    try {
      const qstash = new Client({ token });
      await qstash.publishJSON({
        url: `${appUrl.replace(/\/+$/, "")}/api/export/process`,
        body: { exportId },
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
    .select("id, format, status, created_at, expires_at, size_bytes")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);
  return ((data as any[]) || []).map((r) => ({
    id: r.id,
    format: (r.format as ExportFormat) ?? "json",
    status: r.status,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    sizeBytes: r.size_bytes,
  }));
}

/**
 * A short-lived (5-minute) presigned download URL, generated only on click after
 * verifying the signed-in owner, forcing a friendly filename.
 */
export async function getExportDownloadUrl(exportId: string): Promise<{ ok: boolean; url?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const svc = createServiceRoleClient();
  const { data } = await svc
    .from("account_exports")
    .select("user_id, format, status, storage_key, expires_at, created_at")
    .eq("id", exportId)
    .maybeSingle();
  const r = data as any;
  if (!r || r.user_id !== user.id || r.status !== "ready" || !r.storage_key) return { ok: false };
  if (r.expires_at && new Date(r.expires_at) < new Date()) return { ok: false };
  const ext = r.format === "markdown_zip" ? "zip" : "json";
  const date = new Date(r.created_at).toISOString().slice(0, 10);
  const filename = `justnoted-export-${date}.${ext}`;
  try {
    const url = await presignGet(r.storage_key, 300, filename);
    return { ok: true, url };
  } catch {
    return { ok: false };
  }
}
