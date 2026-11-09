import { NextResponse } from "next/server";
import {
  putPrivateObject,
  deletePrivateObject,
  isPrivateR2Configured,
} from "@/utils/storage/r2-private";

// Public uptime/health probe for external monitors. It reveals only up/down
// status — never keys, URLs, response bodies, stack traces or error messages.
// No auth is required (middleware already excludes /api/*). Never statically
// rendered or cached.
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 5000;

const stripSlash = (u: string) => u.replace(/\/+$/, "");

/** Reject a promise if it hasn't settled within `ms` (named so the caller can
 *  report "timeout" distinctly). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })),
        ms,
      ),
    ),
  ]);
}

// Prove the PRIVATE R2 bucket is WRITABLE (not just reachable): write then
// delete a tiny object under health/. A read-only token fails here, which is
// exactly the misconfiguration this is meant to catch (chat media upload,
// account export write, and media purge all need write). Like the other checks,
// it returns only "ok" | "timeout" | "error" — never keys or error details.
async function r2WriteCheck(): Promise<string> {
  if (!isPrivateR2Configured()) return "error";
  const key = `health/${crypto.randomUUID()}.txt`;
  try {
    await withTimeout(
      putPrivateObject(key, Buffer.from("ok"), "text/plain"),
      TIMEOUT_MS,
    );
    // Best-effort cleanup; an "Object Read & Write" token that can PUT can also
    // DELETE, so a successful write is the gate. Never throws.
    await withTimeout(deletePrivateObject(key), TIMEOUT_MS).catch(() => {});
    return "ok";
  } catch (e) {
    return e instanceof Error && e.name === "TimeoutError" ? "timeout" : "error";
  }
}

// The R2 write probe does a real put+delete, so cache it briefly: frequent
// uptime polls shouldn't hammer the bucket. ~60s is well within a monitor's
// cadence, and the cache is per-process so a restart re-probes immediately.
let _r2Cache: { at: number; result: string } | null = null;
const R2_CACHE_MS = 60_000;
async function cachedR2WriteCheck(): Promise<string> {
  const now = Date.now();
  if (_r2Cache && now - _r2Cache.at < R2_CACHE_MS) return _r2Cache.result;
  const result = await r2WriteCheck();
  _r2Cache = { at: now, result };
  return result;
}

// Run one check with a hard timeout. Returns exactly one of:
//   "ok" | "timeout" | "error <status>" | "error"
// Nothing derived from the URL, headers, response body, or exception is ever
// returned, so the endpoint can't leak configuration or internals.
async function check(url: string, headers: Record<string, string>): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status >= 200 && res.status < 300) return "ok";
    return `error ${res.status}`;
  } catch (e) {
    return e instanceof Error && e.name === "AbortError" ? "timeout" : "error";
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const healthTable = process.env.HEALTH_TABLE;

  // A missing env is a misconfiguration, reported as a failed check (never the
  // name of what's missing).
  const site = appUrl
    ? check(`${stripSlash(appUrl)}/`, {}) // root only — never /api/health (recursion)
    : Promise.resolve("error");

  const auth =
    supabaseUrl && anonKey
      ? check(`${stripSlash(supabaseUrl)}/auth/v1/health`, { apikey: anonKey })
      : Promise.resolve("error");

  // Prove PostgREST/the DB is answering. With HEALTH_TABLE, read one id;
  // otherwise hit the PostgREST root (trailing slash required or Kong won't
  // route it).
  const dbUrl = supabaseUrl
    ? healthTable
      ? `${stripSlash(supabaseUrl)}/rest/v1/${healthTable}?select=id&limit=1`
      : `${stripSlash(supabaseUrl)}/rest/v1/`
    : null;
  const db =
    dbUrl && anonKey
      ? check(dbUrl, { apikey: anonKey, Authorization: `Bearer ${anonKey}` })
      : Promise.resolve("error");

  const [siteR, authR, dbR, r2R] = await Promise.all([site, auth, db, cachedR2WriteCheck()]);
  // Core = what's needed to serve the app (site/auth/db). R2 is non-critical to
  // serving pages, so a non-writable bucket is "degraded" (still 200) rather
  // than "fail" — monitors page on 503 only when the core is actually down.
  const coreOk = siteR === "ok" && authR === "ok" && dbR === "ok";
  const status = !coreOk ? "fail" : r2R === "ok" ? "ok" : "degraded";

  return NextResponse.json(
    { status, site: siteR, auth: authR, db: dbR, r2: r2R },
    { status: coreOk ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
