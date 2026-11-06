import { defineConfig, devices } from "@playwright/test";

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

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./e2e/global-setup.ts",
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
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
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
        timeout: useDevServer ? 120_000 : 300_000,
        reuseExistingServer: !process.env.CI,
      },
});
