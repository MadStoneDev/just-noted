import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { request } from "@playwright/test";
import {
  adminClient,
  hasAdminEnv,
  purgeStaleTestUsers,
  purgeTestUser,
  SEED_FILE,
  TEST_EMAIL_DOMAIN,
} from "./fixtures/admin";
import type { SeedState, SeededAccount } from "./fixtures/auth";

import { productionHosts, validateE2EEnv, hasE2EEnvFile, e2eFileEnv } from "./fixtures/env";

// 1. Hard guard: refuse to run if the test env OR the running app points at the
//    production Supabase.
// 2. Seed the signed-in fixtures into the TEST database (skipped on CI unless
//    E2E_SEED=1, and with E2E_SEED=0).
export default async function globalSetup() {
  if (hasE2EEnvFile()) validateE2EEnv();
  await assertAppNotProduction(process.env.E2E_BASE_URL || "http://localhost:3050");
  await seed();
}

// The app's Supabase URL is inlined into its client bundle at build time, so a
// server built from the wrong env (e.g. a reused `next start` built with
// .env.local) is caught here: no loaded chunk may mention a production host, and
// one must mention the test database. Also warms the main route.
async function assertAppNotProduction(base: string): Promise<void> {
  const ctx = await request.newContext({ baseURL: base });
  try {
    const html = await (await ctx.get("/", { timeout: 120_000 })).text();
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]);
    const bodies = [html];
    for (const src of srcs) bodies.push(await (await ctx.get(src)).text().catch(() => ""));
    const all = bodies.join("\n");
    for (const host of productionHosts()) {
      if (all.includes(host)) {
        throw new Error(
          `[e2e] refusing to run: the app at ${base} is built against the production Supabase (${host}). ` +
            "Stop that server so Playwright rebuilds it with .env.e2e.",
        );
      }
    }
    const testUrl = e2eFileEnv().NEXT_PUBLIC_SUPABASE_URL;
    if (testUrl && !all.includes(new URL(testUrl).host)) {
      throw new Error(`[e2e] refusing to run: can't confirm the app at ${base} uses the test database (${testUrl}).`);
    }
  } finally {
    await ctx.dispose();
  }
}

function seedingEnabled(): boolean {
  if (process.env.E2E_SEED === "0") return false;
  if (process.env.CI && process.env.E2E_SEED !== "1") return false;
  return hasAdminEnv();
}

async function seed(): Promise<void> {
  fs.rmSync(SEED_FILE, { force: true });
  if (!seedingEnabled()) {
    console.log("[e2e seed] skipped (no service-role env, CI, or E2E_SEED=0) — signed-in specs will skip");
    return;
  }
  const db = adminClient();
  const stale = await purgeStaleTestUsers();
  if (stale) console.log(`[e2e seed] removed ${stale} stale test account(s)`);

  const runId = crypto.randomBytes(3).toString("hex");
  const created: string[] = [];
  try {
    const accounts: SeededAccount[] = [];
    for (const label of ["A", "B"]) {
      const email = `e2e-${label.toLowerCase()}-${runId}@${TEST_EMAIL_DOMAIN}`;
      const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
      if (error || !data.user) throw new Error(`createUser ${label}: ${error?.message}`);
      created.push(data.user.id);
      // A signup trigger creates the `authors` row with a random username; give
      // it a known handle so specs can find the account in the switcher.
      const handle = `e2e${label}${runId}`;
      const { error: aErr } = await db.from("authors").upsert({ id: data.user.id, username: handle });
      if (aErr) throw new Error(`authors ${label}: ${aErr.message}`);
      accounts.push({ label, id: data.user.id, email, handle });
    }
    const [a, b] = accounts;

    // Scribe for A (manual comp — billing sync leaves it alone).
    const { error: subErr } = await db.from("subscriptions").upsert(
      { user_id: a.id, tier: "scribe", status: "active", plan_source: "manual", updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (subErr) throw new Error(`subscription: ${subErr.message}`);

    // A note owned by A, shared with B as an editor.
    const { data: note, error: noteErr } = await db
      .from("notes")
      .insert({ author: a.id, title: "E2E shared note", content: "Shared with B for collaboration specs." })
      .select("id")
      .single();
    if (noteErr || !note) throw new Error(`note: ${noteErr?.message}`);
    const shortcode = randomShortcode();
    const { data: share, error: shareErr } = await db
      .from("shared_notes")
      .insert({
        note_id: note.id,
        note_owner_id: a.id,
        shortcode,
        is_public: false,
        is_anonymous: false,
        storage: "supabase",
        link_permission: "view",
      })
      .select("id")
      .single();
    if (shareErr || !share) throw new Error(`share: ${shareErr?.message}`);
    const { error: readerErr } = await db
      .from("shared_notes_readers")
      .insert({ shared_note: share.id, reader_id: b.id, reader_username: b.handle, role: "edit" });
    if (readerErr) throw new Error(`share reader: ${readerErr.message}`);

    const state: SeedState = { runId, accounts, sharedNote: { noteId: note.id, shareId: share.id, shortcode } };
    fs.mkdirSync(path.dirname(SEED_FILE), { recursive: true });
    fs.writeFileSync(SEED_FILE, JSON.stringify(state, null, 2));
    console.log(`[e2e seed] run ${runId}: accounts ${accounts.map((x) => x.handle).join(", ")}`);
  } catch (e) {
    for (const id of created) await purgeTestUser(id).catch(() => {});
    throw e;
  }
}

function randomShortcode(length = 9): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  return Array.from(crypto.randomBytes(length), (n) => chars[n % chars.length]).join("");
}
