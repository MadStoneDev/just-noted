import { defineConfig, devices } from "@playwright/test";
import { hasE2EEnvFile, serverEnv, validateE2EEnv, E2E_ENV_FILE } from "./e2e/fixtures/env";

// Playwright E2E config. Specs live in ./e2e (vitest only scans src/**, so there
// is no spec-file collision).
//
// By default the suite runs against a PRODUCTION build (next build && next start)
// — faster and closer to real use than `next dev`, and it avoids dev-only cold
// compiles / HMR resets that flake out the first assertions. Escape hatches:
//   E2E_BASE_URL=<url>  run against an already-running app (no server managed)
//   E2E_DEV=1           use `next dev` instead of a prod build
const PORT = 3050;
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;
const useDevServer = process.env.E2E_DEV === "1";

// The suite runs against an ISOLATED test database (local Supabase), configured
// in .env.e2e — never .env.local, which points at production. The managed app
// server is built and started with that env only (see e2e/fixtures/env.ts).
// Hard stop at config load if .env.e2e is missing or points at production;
// global-setup re-checks the running app's actual Supabase target.
if (!process.env.E2E_BASE_URL) {
  if (!hasE2EEnvFile()) {
    throw new Error(`[e2e] ${E2E_ENV_FILE} not found — copy .env.e2e.example and fill it from \`supabase status\` (see e2e/README.md)`);
  }
  validateE2EEnv();
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  // Setup seeds the signed-in test accounts (local env only, see e2e/README.md);
  // teardown deletes them and everything they own.
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // WSL I/O under /mnt/g is slow; keep concurrency low so cold routes don't all
  // contend and blow the per-assertion timeout.
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Fake mic/camera + auto-accept the permission prompt, for audio specs
        // (chat voice notes).
        launchOptions: {
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
        },
        permissions: ["microphone"],
      },
    },
    // Add firefox/webkit + a mobile viewport project once the core specs are green.
    // { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
  ],
  // With E2E_BASE_URL the app is assumed up and is not managed here. Otherwise we
  // start it; reuseExistingServer lets you pre-run `next start -p 3050` yourself to
  // skip the rebuild between runs.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: useDevServer ? "npm run dev" : `npm run build && npx next start -p ${PORT}`,
        url: BASE_URL,
        // E2E_TEST_HOOKS enables test-only server behaviour that is inert in any
        // deployed env (e.g. the leave-save drop cookie, see
        // src/app/api/notes/leave-save/route.ts). Only ever set here.
        env: { ...serverEnv(), E2E_TEST_HOOKS: "1" },
        timeout: useDevServer ? 120_000 : 300_000,
        reuseExistingServer: !process.env.CI,
      },
});
