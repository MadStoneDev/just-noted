# Settings (and every routed view) is unreachable offline: a full page load to the browser's offline page

- **Status:** open. Found in release smoke test f4 (2026-11-25), split out of the f4 fix.
- **Severity:** high. No data is lost (the open editor's save is queued on the way out), but the app is replaced by the browser's offline page until the connection returns. The only way to remove another account from this device (Settings → Account → Remove) can't be reached offline.
- **Area:** client routing of the `(app)` route group. `src/components/note-wrapper.tsx` (the `justnoted:open-*` handlers), `src/components/account-menu.tsx` ("Manage accounts"), `src/app/(app)/settings/page.tsx`. Covered by `e2e/sign-out-offline-multi-account.spec.ts` case (b), marked `test.fail` until this is fixed.

## Problem

Settings, Roadmap, Tools and Admin are separate routes that the app reaches
with `router.push` (note-wrapper.tsx, `openSettings` and friends). Offline,
Next's client navigation can't fetch the route's RSC payload. It logs:

```
Failed to fetch RSC payload for http://localhost:3050/settings. Falling back to browser navigation. TypeError: Failed to fetch
```

and does a full page load, which shows the browser's offline page
(`chrome-error://chromewebdata/`).

Repro (E2E case (b)): two accounts on the device, go offline, open the
accounts menu, then "Manage accounts".

## Fix options

1. **Render Settings inside the app shell** (a view the notes app switches to,
   like the notes grid, with `?section=` kept in the URL via `history.replaceState`)
   instead of a separate route. Works offline with no fetch. Most robust; the
   routed views can follow one at a time.
2. **Prefetch and keep the routed views' RSC payloads** (`router.prefetch` on
   boot, plus a service-worker cache for `/settings?_rsc=…`). Smaller change,
   but it depends on Next's prefetch cache lifetime and the payload matching.
   It still breaks for a view never prefetched.
3. **Guard client navigation offline:** if `navigator.onLine === false`, don't
   navigate; show "You're offline. Settings needs a connection." This stops the
   offline page, but it still leaves "Remove account" unreachable offline. Pair it with:
4. **Per-account "Remove from this device" in the accounts menu** for
   non-active accounts. It touches no session or data (`removeAccount` only), so
   it's safe offline.

Recommended: 3 + 4 now (small, closes the offline-page hole and the
unreachable action), and 1 later.

## Done when

- `e2e/sign-out-offline-multi-account.spec.ts` (b) passes with its
  `test.fail` removed. If option 4 is chosen, it removes the account from the
  accounts menu instead of Settings.
- No routed view does a full page load while offline.
