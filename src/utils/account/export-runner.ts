import "server-only";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { putPrivateObject, deletePrivateObject, EXPORTS_PREFIX } from "@/utils/storage/r2-private";

const EXPIRY_DAYS = 7;

/** Assemble a complete JSON bundle of the user's data. */
async function buildExportJson(userId: string): Promise<string> {
  const svc = createServiceRoleClient();
  const [notes, notebooks, tags, versions, subscription, author] = await Promise.all([
    svc.from("notes").select("*").eq("author", userId).order("created_at", { ascending: true }),
    svc.from("notebooks").select("*").eq("owner", userId),
    svc.from("tags").select("*").eq("owner", userId),
    svc
      .from("note_versions")
      .select("note_id, title, content, content_format, reason, created_at")
      .eq("author", userId),
    svc.from("subscriptions").select("tier, status, current_period_end, plan_source").eq("user_id", userId).maybeSingle(),
    svc.from("authors").select("username, avatar_url").eq("id", userId).maybeSingle(),
  ]);

  const bundle = {
    export_version: 1,
    generated_at: new Date().toISOString(),
    account: {
      user_id: userId,
      profile: (author as any).data ?? null,
      subscription: (subscription as any).data ?? null,
    },
    notes: (notes as any).data ?? [],
    notebooks: (notebooks as any).data ?? [],
    tags: (tags as any).data ?? [],
    version_history: (versions as any).data ?? [],
  };
  return JSON.stringify(bundle, null, 2);
}

/**
 * Process one export: build the bundle, upload it to the private bucket, and
 * mark the row ready (or failed). Idempotent enough to retry.
 */
export async function processExport(exportId: string): Promise<{ ok: boolean }> {
  const svc = createServiceRoleClient();
  const { data: row } = await svc
    .from("account_exports")
    .select("id, user_id, status")
    .eq("id", exportId)
    .maybeSingle();
  const r = row as { id: string; user_id: string; status: string } | null;
  if (!r) return { ok: false };
  if (r.status === "ready") return { ok: true };

  await svc.from("account_exports").update({ status: "processing" } as any).eq("id", exportId);

  try {
    const json = await buildExportJson(r.user_id);
    const key = `${EXPORTS_PREFIX}${r.user_id}/${exportId}.json`;
    const body = Buffer.from(json, "utf8");
    await putPrivateObject(key, body, "application/json");
    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86400000).toISOString();
    await svc
      .from("account_exports")
      .update({ status: "ready", storage_key: key, size_bytes: body.byteLength, expires_at: expiresAt, error: null } as any)
      .eq("id", exportId);
    return { ok: true };
  } catch (e) {
    console.error("[export] processing failed:", e);
    await svc
      .from("account_exports")
      .update({ status: "failed", error: "processing_failed" } as any)
      .eq("id", exportId);
    return { ok: false };
  }
}

/** Delete exports past their expiry (objects + rows). Called by the cron. */
export async function purgeExpiredExports(): Promise<{ success: boolean; purged: number }> {
  const svc = createServiceRoleClient();
  const { data, error } = await svc
    .from("account_exports")
    .select("id, storage_key")
    .lte("expires_at", new Date().toISOString());
  if (error) return { success: false, purged: 0 };
  const rows = (data as { id: string; storage_key: string | null }[]) || [];
  for (const row of rows) {
    if (row.storage_key) await deletePrivateObject(row.storage_key);
    await svc.from("account_exports").delete().eq("id", row.id);
  }
  return { success: true, purged: rows.length };
}

/** Delete all of a user's exports (objects + rows) — for account deletion. */
export async function purgeUserExports(userId: string): Promise<void> {
  if (!userId) return;
  const svc = createServiceRoleClient();
  const { data } = await svc.from("account_exports").select("id, storage_key").eq("user_id", userId);
  const rows = (data as { id: string; storage_key: string | null }[]) || [];
  for (const row of rows) {
    if (row.storage_key) await deletePrivateObject(row.storage_key);
  }
  await svc.from("account_exports").delete().eq("user_id", userId);
}
