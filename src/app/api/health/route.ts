import { NextResponse } from "next/server";

// Public uptime/health probe for external monitors. It reveals only up/down
// status — never keys, URLs, response bodies, stack traces or error messages.
// No auth is required (middleware already excludes /api/*). Never statically
// rendered or cached.
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 5000;

const stripSlash = (u: string) => u.replace(/\/+$/, "");

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

  const [siteR, authR, dbR] = await Promise.all([site, auth, db]);
  const ok = siteR === "ok" && authR === "ok" && dbR === "ok";

  return NextResponse.json(
    ok
      ? { status: "ok", site: siteR, auth: authR, db: dbR }
      : { status: "fail", site: siteR, auth: authR, db: dbR },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
