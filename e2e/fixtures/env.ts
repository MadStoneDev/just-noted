import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// E2E environment isolation.
//
// The suite never uses .env.local (that points at production). Everything it
// needs comes from .env.e2e (override the path with E2E_ENV_FILE), and the app
// server it builds gets a DENY-BY-DEFAULT env: every key .env.local defines is
// blanked, then .env.e2e is applied on top. Next.js only fills a key from
// .env.local when the process env leaves it undefined — an empty string counts
// as defined — so production values can't leak in.

const ROOT = path.resolve(__dirname, "../..");
export const E2E_ENV_FILE = path.resolve(ROOT, process.env.E2E_ENV_FILE || ".env.e2e");

// Supabase hosts the suite must never touch. The .env.local URL is added too,
// since that file is the developer's production-pointed env.
const PRODUCTION_SUPABASE_HOSTS = ["supabase.justnoted.app"];

function parseFile(file: string): Record<string, string> {
  try {
    return dotenv.parse(fs.readFileSync(file, "utf8").replace(/\r/g, ""));
  } catch {
    return {};
  }
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export function productionHosts(): string[] {
  const local = hostOf(parseFile(path.join(ROOT, ".env.local")).NEXT_PUBLIC_SUPABASE_URL);
  return [...new Set([...PRODUCTION_SUPABASE_HOSTS, ...(local ? [local] : [])])];
}

/** Throw if `url` is a production Supabase URL. */
export function assertNotProductionSupabase(url: string | undefined, where: string): void {
  const host = hostOf(url);
  if (host && productionHosts().includes(host)) {
    throw new Error(
      `[e2e] refusing to run: ${where} points at the production Supabase (${host}). ` +
        `Use a local Supabase (see e2e/README.md) via .env.e2e.`,
    );
  }
}

/** Keys that send real mail / charge cards / call production side services. */
const MUST_BE_BLANK = ["RESEND_API_KEY", "RESEND", "MAILERSEND_API", "STRIPE_SECRET_KEY"];

export function e2eFileEnv(): Record<string, string> {
  return parseFile(E2E_ENV_FILE);
}

export function hasE2EEnvFile(): boolean {
  return fs.existsSync(E2E_ENV_FILE);
}

/** Validate .env.e2e: not production, no live mail/billing, Redis not shared with .env.local. */
export function validateE2EEnv(env: Record<string, string> = e2eFileEnv()): void {
  assertNotProductionSupabase(env.NEXT_PUBLIC_SUPABASE_URL, E2E_ENV_FILE);
  for (const k of MUST_BE_BLANK) {
    if (env[k]) throw new Error(`[e2e] refusing to run: ${k} is set in ${E2E_ENV_FILE} — tests must not send real email or billing calls`);
  }
  const local = parseFile(path.join(ROOT, ".env.local"));
  if (env.VALKEY_URL && env.VALKEY_URL === local.VALKEY_URL) {
    throw new Error("[e2e] refusing to run: .env.e2e uses the same Valkey as .env.local (production)");
  }
}

/** The app server's env: blank every .env.local key, then apply .env.e2e. */
export function serverEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of Object.keys(parseFile(path.join(ROOT, ".env.local")))) env[k] = "";
  for (const k of MUST_BE_BLANK) env[k] = "";
  Object.assign(env, e2eFileEnv());
  for (const k of MUST_BE_BLANK) env[k] = "";
  return env;
}

// Make .env.e2e the test process's env (overriding anything inherited), so the
// fixtures' admin client and the specs only ever see the test database.
export function applyE2EEnvToProcess(): void {
  const env = e2eFileEnv();
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
}
