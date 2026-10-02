#!/usr/bin/env node
// Asserts that each PUBLIC routed view ships its key content in the SERVER HTML
// (not only after client hydration) — the SEO requirement behind the Tools/
// public-views server-render slot. Fetches each route and greps the raw response.
//
// Usage:
//   BASE_URL=http://localhost:3050 node scripts/check-public-ssr.mjs
//   BASE_URL=https://justnoted.app node scripts/check-public-ssr.mjs
// Default BASE_URL is http://localhost:3050. Run against `npm start` or prod.
// Exits non-zero if any route is missing its expected content.

const BASE = (process.env.BASE_URL || "http://localhost:3050").replace(/\/$/, "");

// The notes sidebar must NOT be server-rendered on public routes (SEO noise +
// hydration mismatch). None of these may appear in any public route's HTML.
const FORBIDDEN = ["Nothing written yet", "Skip to notes", "Your notes will appear here"];

// Each route must contain ALL of these substrings in the first HTML response.
const ROUTES = [
  { path: "/pricing", needs: ["Plans", "Scribe", "Draft"] },
  { path: "/roadmap", needs: ["Roadmap", "Vote on what matters"] },
  { path: "/tools", needs: ["Tools", "Slug generator", "Case converter", "Word counter", "Search result preview", "Open Graph tester"] },
  { path: "/tools/slug-generator", needs: ["Slug generator", "How it works"] },
  { path: "/tools/case-converter", needs: ["Case converter", "How it works"] },
  { path: "/tools/word-counter", needs: ["Word counter", "How it works"] },
  { path: "/tools/serp-preview", needs: ["Search result preview", "How it works"] },
  { path: "/tools/og-tester", needs: ["Open Graph tester", "How it works"] },
  { path: "/the-how", needs: ["How does JustNoted work"] },
  { path: "/the-what", needs: ["What is JustNoted"] },
];

let failed = 0;

for (const { path, needs } of ROUTES) {
  const url = BASE + path;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "justnoted-ssr-check" } });
    const html = await res.text();
    const missing = needs.filter((s) => !html.includes(s));
    const leaked = FORBIDDEN.filter((s) => html.includes(s));
    if (res.status !== 200 || missing.length || leaked.length) {
      failed++;
      console.error(`✗ ${path}  (status ${res.status})`);
      if (missing.length) console.error(`    missing from server HTML: ${missing.map((m) => JSON.stringify(m)).join(", ")}`);
      if (leaked.length) console.error(`    notes-sidebar markup leaked into server HTML: ${leaked.map((m) => JSON.stringify(m)).join(", ")}`);
    } else {
      console.log(`✓ ${path}`);
    }
  } catch (err) {
    failed++;
    console.error(`✗ ${path}  (fetch failed: ${err instanceof Error ? err.message : String(err)})`);
  }
}

if (failed) {
  console.error(`\n${failed} route(s) missing server-rendered content.`);
  process.exit(1);
}
console.log(`\nAll ${ROUTES.length} public routes server-render their content.`);
