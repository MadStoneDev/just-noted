import fs from "node:fs";
import { hasAdminEnv, purgeTestUser, SEED_FILE } from "./fixtures/admin";
import type { SeedState } from "./fixtures/auth";

// Remove this run's test accounts and everything they own (notes, shares,
// subscription, profile, auth user). Set E2E_KEEP_SEED=1 to keep them for
// debugging — the next run's setup purges any stale test accounts anyway.
export default async function globalTeardown() {
  if (process.env.E2E_KEEP_SEED === "1" || !hasAdminEnv()) return;
  let state: SeedState;
  try {
    state = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
  } catch {
    return;
  }
  for (const acc of state.accounts) {
    try {
      await purgeTestUser(acc.id);
    } catch (e) {
      console.error(`[e2e teardown] failed to purge ${acc.label}:`, e);
    }
  }
  fs.rmSync(SEED_FILE, { force: true });
}
