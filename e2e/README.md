# JustNoted E2E (Playwright)

End-to-end suite for the core flows that must stay green before — and during — the
React Native/Expo mobile build (see `docs/mobile-readiness.md` → "Ready-for-mobile gate").

## Running

```bash
npm install                 # installs @playwright/test
npx playwright install      # one-time: download browsers
npm run test:e2e            # boots `next dev` on :3050 and runs the suite
npm run test:e2e:ui         # interactive UI mode
```

Against an already-running app (local or staging), skip the managed dev server:

```bash
E2E_BASE_URL=https://staging.example npm run test:e2e
```

### Environment

The app needs its normal runtime env to boot (Supabase, Redis/Upstash, etc. — see
`.env.example`). Anonymous "local" notes are Redis-backed server-side, so even the
guest flows need `UPSTASH_REDIS_REST_*`. Signed-in flows need a seeded test account;
put its credentials in `E2E_USER_EMAIL` / `E2E_USER_OTP` (or wire a magic-link
interception helper) before enabling the cloud specs.

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
