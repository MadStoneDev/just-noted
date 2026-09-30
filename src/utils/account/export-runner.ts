import "server-only";
import { zipSync, strToU8 } from "fflate";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { putPrivateObject, deletePrivateObject, EXPORTS_PREFIX } from "@/utils/storage/r2-private";
import { readAllNotes } from "@/utils/redis/note-store";
import { sendEmail } from "@/utils/email/send";

const EXPIRY_DAYS = 7;
const ROW_KEEP_DAYS = 90; // metadata rows kept this long after request, then purged

type Svc = ReturnType<typeof createServiceRoleClient>;

function safeName(s: string, fallback: string): string {
  const cleaned = (s || "").replace(/[\/\\:*?"<>|\u0000-\u001f]/g, " ").trim().slice(0, 80);
  return cleaned || fallback;
}

async function gather(svc: Svc, userId: string, anonId: string | null) {
  const [notes, notebooks, tags, versions, subscription, author, deviceNotes] = await Promise.all([
    svc.from("notes").select("*").eq("author", userId).order("created_at", { ascending: true }),
    svc.from("notebooks").select("*").eq("owner", userId),
    svc.from("tags").select("*").eq("owner", userId),
    svc.from("note_versions").select("note_id, title, content, content_format, reason, created_at").eq("author", userId),
    svc.from("subscriptions").select("tier, status, current_period_end, plan_source").eq("user_id", userId).maybeSingle(),
    svc.from("authors").select("username, avatar_url").eq("id", userId).maybeSingle(),
    anonId ? readAllNotes(anonId).catch(() => []) : Promise.resolve([]),
  ]);
  return {
    notes: (notes as any).data ?? [],
    notebooks: (notebooks as any).data ?? [],
    tags: (tags as any).data ?? [],
    versions: (versions as any).data ?? [],
    subscription: (subscription as any).data ?? null,
    author: (author as any).data ?? null,
    deviceNotes: (deviceNotes as any[]) ?? [],
  };
}

function buildJson(userId: string, g: Awaited<ReturnType<typeof gather>>): Uint8Array {
  const bundle = {
    export_version: 1,
    generated_at: new Date().toISOString(),
    account: { user_id: userId, profile: g.author, subscription: g.subscription },
    notes: g.notes,
    notebooks: g.notebooks,
    tags: g.tags,
    version_history: g.versions,
    device_notes: g.deviceNotes, // local notes from the requesting browser only
  };
  return strToU8(JSON.stringify(bundle, null, 2));
}

function buildMarkdownZip(g: Awaited<ReturnType<typeof gather>>): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const nbName = new Map<string, string>();
  for (const nb of g.notebooks) nbName.set(nb.id, safeName(nb.name, "Notebook"));
  const used = new Set<string>();

  const put = (folder: string, title: string, content: string) => {
    let base = `${folder}/${safeName(title, "Untitled")}`;
    let path = `${base}.md`;
    let i = 2;
    while (used.has(path)) path = `${base} (${i++}).md`;
    used.add(path);
    files[path] = strToU8(`# ${title || "Untitled"}\n\n${content || ""}\n`);
  };

  for (const n of g.notes) {
    const folder = n.notebook_id && nbName.has(n.notebook_id) ? nbName.get(n.notebook_id)! : "Loose notes";
    put(folder, n.title || "Untitled", n.content || "");
  }
  for (const n of g.deviceNotes) {
    put("Device notes", n.title || "Untitled", n.content || "");
  }
  if (Object.keys(files).length === 0) files["README.md"] = strToU8("# JustNoted export\n\nNo notes to export.\n");
  return zipSync(files, { level: 6 });
}

async function userEmail(svc: Svc, userId: string): Promise<string | null> {
  try {
    const { data } = await (svc as any).auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

/** Build + upload one export, mark it ready, and email the user. */
export async function processExport(exportId: string): Promise<{ ok: boolean }> {
  const svc = createServiceRoleClient();
  const { data: row } = await svc
    .from("account_exports")
    .select("id, user_id, format, anon_id, status")
    .eq("id", exportId)
    .maybeSingle();
  const r = row as { user_id: string; format: string; anon_id: string | null; status: string } | null;
  if (!r) return { ok: false };
  if (r.status === "ready") return { ok: true };

  await svc.from("account_exports").update({ status: "processing" } as any).eq("id", exportId);

  try {
    const g = await gather(svc, r.user_id, r.anon_id);
    const isZip = r.format === "markdown_zip";
    const body = isZip ? buildMarkdownZip(g) : buildJson(r.user_id, g);
    const ext = isZip ? "zip" : "json";
    const key = `${EXPORTS_PREFIX}${r.user_id}/${exportId}.${ext}`;
    await putPrivateObject(key, body, isZip ? "application/zip" : "application/json");

    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86400000).toISOString();
    await svc
      .from("account_exports")
      .update({ status: "ready", storage_key: key, size_bytes: body.byteLength, expires_at: expiresAt, error: null } as any)
      .eq("id", exportId);

    // Email the user (best-effort). The download itself still requires sign-in.
    const email = await userEmail(svc, r.user_id);
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://justnoted.app").replace(/\/+$/, "");
    if (email) {
      await sendEmail({
        to: email,
        subject: "Your JustNoted export is ready",
        html: `<p>Your account export is ready to download.</p>
<p>Sign in and go to <a href="${appUrl}/settings?section=${encodeURIComponent("Sync & data")}">Settings &rarr; Sync &amp; data</a> to download it. The file is available for ${EXPIRY_DAYS} days.</p>`,
      });
    }
    return { ok: true };
  } catch (e) {
    console.error("[export] processing failed:", e);
    await svc.from("account_exports").update({ status: "failed", error: "processing_failed" } as any).eq("id", exportId);
    return { ok: false };
  }
}

/**
 * Expire ready exports past their window (delete the object, clear the key, mark
 * expired — but KEEP the small metadata row), and hard-purge rows older than 90
 * days. Called by the cron.
 */
export async function purgeExpiredExports(): Promise<{ success: boolean; expired: number; removed: number }> {
  const svc = createServiceRoleClient();
  const now = new Date().toISOString();

  const { data: due, error } = await svc
    .from("account_exports")
    .select("id, storage_key")
    .eq("status", "ready")
    .lte("expires_at", now);
  if (error) return { success: false, expired: 0, removed: 0 };
  const rows = (due as { id: string; storage_key: string | null }[]) || [];
  for (const row of rows) {
    if (row.storage_key) await deletePrivateObject(row.storage_key);
    await svc
      .from("account_exports")
      .update({ status: "expired", storage_key: null, size_bytes: null } as any)
      .eq("id", row.id);
  }

  // Hard-delete metadata rows older than 90 days.
  const cutoff = new Date(Date.now() - ROW_KEEP_DAYS * 86400000).toISOString();
  const { data: old } = await svc.from("account_exports").select("id, storage_key").lte("created_at", cutoff);
  const oldRows = (old as { id: string; storage_key: string | null }[]) || [];
  for (const row of oldRows) {
    if (row.storage_key) await deletePrivateObject(row.storage_key);
    await svc.from("account_exports").delete().eq("id", row.id);
  }

  return { success: true, expired: rows.length, removed: oldRows.length };
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
