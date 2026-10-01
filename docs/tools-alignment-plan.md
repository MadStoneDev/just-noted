# Tools alignment + Phase 2 — plan

Aligns the live Tools (Phase 1) to Claude Design's handoff (`11-tools.md`, tokens
in `01-foundations.md`) and builds Phase 2. Specs are the source of truth for
behaviour; this file is the source of truth for sequencing and decisions. Every
phase ships behind the gate (tsc + vitest + build), pushed on request.

## Confirmed decisions (override the spec where noted)

1. **Server-render slot** for ALL public routed views in the `(app)` shell — not
   just Tools. The shell currently renders these client-side inside `NoteWrapper`
   (view chosen in a `useEffect` from the URL), so the content is NOT in the first
   server HTML — verified: `/pricing` (no "Scribe"/price), `/roadmap`, `/tools/*`.
   Fix: `(app)/layout.tsx` passes `children` into `NoteWrapper` as a main slot; the
   public marker pages render their view server-side; NoteWrapper renders the slot
   on those routes. **Applies to: Pricing, Roadmap, the-how, the-what, Tools
   (grid + each tool).** Private views (notebooks, settings, admin, trash) stay
   client-rendered — no SEO need. Add a test/script that fetches each public route
   and asserts key content is in the server HTML.
2. **Rail:** guests AND signed-in get the normal app rail (Tools after Search).
   The design's reduced guest rail just shows the rail is present, not a different
   rail — do not build a reduced rail.
3. **"Try JustNoted free"** (outline) links to the app (`/`), not sign-up — guests
   can write without an account.
4. **Slug defaults:** Remove filler words ON, Max length 60. Both user-adjustable.
5. **Titles** (keyword-first, brand last, ≤60), approved:
   - `/tools` → `Free Online Writing Tools | JustNoted`
   - slug-generator → `Slug Generator: Turn Titles into URL Slugs | JustNoted`
   - case-converter → `Case Converter: Change Text Case Online | JustNoted`
   - word-counter → `Word Counter: Count Words & Reading Time | JustNoted`
   - serp-preview → `SERP Preview: Check Title & Description Length | JustNoted`
   - og-tester → `Open Graph Tester: Preview How Links Share | JustNoted`
   - **"Open Graph" is two words in the og-tester title, H1 and all copy.**

## Phase A — align Phase 1 to the spec

- **A0 — server-render slot + shell.** Layout slot; convert the public view
  components (Pricing/Roadmap/TheHow/TheWhat/ToolsGrid/ToolView) to navigate via
  `useRouter` internally (so server pages can render them without passing function
  props); marker pages render them; NoteWrapper renders the slot on public routes
  and drops its client-render branches for them. Server-HTML assertion test.
  Then the Tools shell: 52px top bar (breadcrumb + guest Sign in ghost / Try
  JustNoted free outline → `/`), guest theme = `prefers-color-scheme` + footer
  override (localStorage `jn.tools.theme`), signed-in = Settings theme.
- **A1 — foundations audit.** Confirm every `01-foundations` token exists in our
  Tailwind theme; self-host Newsreader / Public Sans / JetBrains Mono if not
  already. Report gaps (add tokens, never raw hex).
- **A2 — shared components.** Copy (4 states, fixed width, 1.6s, aria-live,
  clipboard fallback, ⌘⇧C), Undo (50-step per-tool stack, 1s typing-group,
  ⌘Z/⇧⌘Z), live counts bar (selection-aware, Unicode word def), toggle / stepper /
  segmented, notices (3 levels, inline, roles), disabled-primary.
- **A3 — grid** to spec: H1 + intro exact, typographic tiles, exact card copy,
  "Open tool →", whole-card link, Coming-soon dashed cards (word-counter / serp /
  og — non-interactive, no route), 3/2/list breakpoints, footer.
- **A4 — tool template:** back link, H1 + description (exact copy), privacy line
  variants, How it works (2–4 paras + FAQ accordion first-open/one-at-a-time,
  `FAQPage` JSON-LD), footer (CTA + All tools + guest theme switch),
  above-the-fold, `WebApplication` JSON-LD, canonical/OG per §11.
- **A5 — slug generator** to spec: NFKD + ligature transliteration, full filler
  list (never empties), Removed line, trim at word boundary, batch `-2/-3`
  suffixes + synced scroll + blank-line preservation + 1,000-line cap, multi-line
  paste → switch, no-Latin notice, `n/max` counter + trimmed state.
- **A6 — case converter** to spec: 316px palette (all 20 visible), chips in their
  own style, Developer per-line with camel-boundary split, Cleanup Spaces/Lines/
  Characters, selection-only + reselect, inline "what changed" notice, last-used
  chip, 42% disabled, Web Worker > 200k chars.
- **A7 — mobile + a11y:** header-replaces-rail, ≥44px, slug wrapping output +
  settings rows, case segmented groups + scrolling chips + keyboard-rising sticky
  bar, roving-tabindex toolbar, aria-live throttle, reduced-motion.
- **A8 — §13 checklist** walkthrough; report anything unmet.

## Phase B — Tools Phase 2

- **B1 — word counter** (`/tools/word-counter`): 6 stats (Intl.Segmenter,
  sentence/paragraph rules, reading/speaking), Copy stats, keywords (1/2/3-word,
  stopword toggle, top-5 bars + Show all).
- **B2 — SERP preview** (`/tools/serp-preview`): canvas `measureText` pixel-width
  truncation, limit meter + amber overflow, status line, white card both themes,
  Desktop/Mobile, disclaimer, no engine branding.
- **B3 — Open Graph tester** (`/tools/og-tester`): `POST /api/tools/og` SSE
  (progress/result/error), client checklist, neutral previews, raw tags + Copy as
  HTML, CSP update for external og:images. **SSRF hardening:** block the spec list
  + `0.0.0.0/8`, `100.64.0.0/10`, `fe80::/10`, IPv4-mapped IPv6 (`::ffff:x.x.x.x`),
  multicast/broadcast; resolve DNS → validate resolved IP → connect to that IP
  (anti-rebinding); re-validate on every redirect; same checks on the og:image
  HEAD/ranged-GET; http/https on ports 80/443 only; 10s timeout, 5 redirects, 1MB
  HTML, 5MB image; identifying UA; 20 tests/min per IP; store nothing. Unit tests
  for every SSRF rule (private IPs, IPv6 + mapped forms, redirect-to-private,
  rebinding, bad ports).

## Phase C — privacy policy

Add: the Open Graph tester fetches the entered URL from our server to read its
tags; your IP is used briefly for rate-limiting; nothing is stored. Re-verify the
local tools' "your text never leaves your device" promise (no text in analytics,
errors or storage).

## Known gaps / can't fully meet

- Per-tool 1200×630 OG card images are "to be designed" — use the default OG image
  until they arrive.
- Any `01-foundations` token missing from the theme is reported in A1 and added.
