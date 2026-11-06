import { defineConfig, devices } from "@playwright/test";

// Playwright E2E config. Specs live in ./e2e (vitest only scans src/**, so there
// is no spec-file collision). By default this boots the Next dev server on 3050;
// set E2E_BASE_URL to run against an already-running app (local or staging).
const PORT = 3050;
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
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
  // When E2E_BASE_URL is set we assume the app is already up and don't manage it.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
