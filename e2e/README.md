# JustNoted E2E (Playwright)

End-to-end suite for the core flows that must stay green before — and during — the
React Native/Expo mobile build (see `docs/mobile-readiness.md` → "Ready-for-mobile gate").

## Running

```bash
npm install                 # installs @playwright/test
npx playwright install      # one-time: download browsers
npm run test:e2e            # builds + starts the app on :3050 with .env.e2e and runs the suite
npm run test:e2e:ui         # interactive UI mode
```

Against an already-running app, skip the managed server (global-setup still
verifies it isn't built against production):

```bash
E2E_BASE_URL=https://staging.example npm run test:e2e
```

### Environment — isolated test database only

The suite never touches production. It uses **only `.env.e2e`** (gitignored;
copy `.env.e2e.example`), and the app server Playwright builds gets a
deny-by-default env: every `.env.local` key is blanked, then `.env.e2e` applied.

```bash
supabase start                                  # local Supabase (Docker), applies supabase/migrations
supabase status                                 # copy API URL / anon / service_role into .env.e2e
docker compose -f e2e/docker-compose.yml up -d  # local Upstash-compatible Redis for guest notes
npm run test:e2e
```

Hard guards (each refuses to run):
- `playwright.config.ts` — `.env.e2e` missing, its Supabase URL is production
  (`supabase.justnoted.app` or whatever `.env.local` points at), a mail/billing key
  (`RESEND_API_KEY`, `RESEND`, `MAILERSEND_API`, `STRIPE_SECRET_KEY`, `QSTASH_TOKEN`)
  is set, or it shares `.env.local`'s Upstash.
- `global-setup.ts` — the RUNNING app's client bundle mentions a production
  Supabase host, or doesn't mention the test one (catches a reused `next start`
  built from `.env.local`).
- `fixtures/admin.ts` — the service-role client re-checks the URL on creation.

No real email: Resend sends nothing without a key (`src/utils/email/send.ts`), and
the local Supabase delivers auth mail to its Mailpit inbox (http://127.0.0.1:54324).

### Signed-in accounts

`global-setup.ts` creates two accounts per run (`e2e-a-…`/`e2e-b-…@e2e.justnoted.test`):
A has Scribe (`plan_source: 'manual'`) and owns a note shared with B (edit).
`global-teardown.ts` deletes them and everything they own (`E2E_KEEP_SEED=1` keeps
them; the next run purges stale `@e2e.justnoted.test` accounts first). Sessions are
minted per test via admin `generateLink` + `verifyOtp` (the OTP path) and injected as
the `@supabase/ssr` auth cookie — see `fixtures/auth.ts`.

## Conventions

- Specs are `*.spec.ts` in this directory.
- Prefer accessible roles and text; fall back to **stable `data-testid`s** for things
  with no good role (e.g. the Milkdown surface). Add testids to product components as
  you unskip each flow — don't couple specs to CSS classes.
- Known anchors that already exist in the app:
  - `main[aria-label="Note editor"]` / `main[aria-label="Shared note"]`
  - note rows carry `data-note-id="<id>"`
  - account button `button[aria-label="Account"]`, new-note FAB `[aria-label="New note"]`

## Coverage (Ready-for-mobile gate)

Live now:
- [x] app shell loads (`smoke.spec.ts`)
- [x] create / edit / reload a note — local (Redis) (`core-flows.spec.ts`)
- [x] a new note appears in the sidebar immediately (B8/D13)

To fill in (currently `test.fixme` in `core-flows.spec.ts`), verifying selectors
against the running app:
- [ ] create / edit / reload a note — cloud (Supabase)
- [ ] keyboard note switching focuses the editor (E1)
- [ ] rail navigation closes overlays (B6)
- [ ] account switching keeps the "Switching…" screen until loaded + no cross-account write (B7)
- [ ] move a note local ↔ cloud
- [ ] share with edit access + two-context live editing without reload
- [ ] trash / restore and shared-note access gate
- [ ] account data export
- [ ] delete / restore account
- [ ] October features w/o browser tests: recipient pin/hide/sort/tags/drag-reorder,
      unified shared NoteView + split view, chat drawer, tags on notes
