import { request } from "@playwright/test";

// Warm the app's main route once before the suite so the first real test doesn't
// absorb a cold compile (matters for `next dev`; harmless for a prod build).
// Tolerant of failure — the webServer readiness check already gates on the server
// responding, so this is best-effort pre-warming only.
export default async function globalSetup() {
  const base = process.env.E2E_BASE_URL || "http://localhost:3050";
  try {
    const ctx = await request.newContext({ baseURL: base });
    await ctx.get("/", { timeout: 60_000 }).catch(() => {});
    await ctx.dispose();
  } catch {
    /* ignore — tests will surface a genuinely unreachable app */
  }
}
