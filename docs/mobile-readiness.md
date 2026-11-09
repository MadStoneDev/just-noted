# JustNoted — React Native (Expo) Readiness Audit

_Last updated: 2026-11-06. Read-only audit of the web app at time of writing; verify file paths against current code before acting._

The hard dependency for a mobile client is **not** the editor or payments — it is that note storage is split two ways (Redis for anonymous/guest users keyed by a localStorage UUID; Supabase/Postgres under RLS for signed-in users) and the sync engine is spread across React hooks rather than isolated behind a portable core. The decisions below (see [Decisions](#decisions)) resolve the storage split in mobile's favour and reduce the surface considerably.

**Ordering:** JustSent's mobile app ships first. The work in this document is the JustNoted web track that runs in the meantime so the web app is ready when mobile starts.

---

## Decisions (locked)

1. **Mobile guest notes = device-only SQLite.** No Redis, no account needed for local notes. An account is required only for cloud notes. Moving a local note into the account stays one tap. **No Redis API surface is built for mobile** — the entire anonymous/Redis path is sidestepped on mobile.
2. **Subscriptions = a single `subscriptions` row per user ("paid is paid").** Scribe from any source unlocks both web and mobile. Two safeguards:
   - **Paywalls check the row first.** If the user is already Scribe from another source, both platforms show "You already have Scribe" instead of selling it again.
   - **Only the source that currently owns the row (`plan_source`) can downgrade it.** A webhook event from a different source must not overwrite an active subscription — log it instead.
   - Widen `plan_source` and add generic external-id columns to support this.
3. **Editor = Milkdown in a WebView with a markdown bridge; native UI everywhere else.** Prototype early in **Expo Go (no EAS build)** and specifically test, on a long note: keyboard not covering text; no layout jump when the keyboard opens; native-feeling scroll inside the note only; text selection and long-press menus; no white flash on open; fonts/spacing matching the native UI.

---

## 1. Current status of pre-launch work

**Confirmed done** (verified in git): A1–A5, B6, F1, F2. **Presence authz "step 1"** is code-complete but inert — migration `20261003_realtime_presence_authz.sql` ships `can_access_note_live()` + RLS on `realtime.messages`, but the client is gated behind `NEXT_PUBLIC_PRIVATE_REALTIME`, off by default. Verify script (`scripts/verify-realtime-presence.mjs`) is manual, not CI.

**Still pending — the batch stalled after Oct 3.** B7, B8, D13#1, C9–C12, E1, E2 (first-line titles), F3, Playwright, and the yjs private-channel migration show no commits, no code, no label references in the tree.
- **No Playwright at all** — no `e2e/`, no config, no dep. The 27 `*.test.ts` files are all Vitest unit tests.
- **yjs channel authz is genuinely parked:** `yjs:${roomKey}` is still a plain Realtime broadcast channel with no `private` flag and no RLS. **Collab editing itself is live and auto-enables on edit-shared notes** — only the channel _authorization_ is parked (on presence E2E).

**Shipped since early October** (where effort went instead): notifications system fully built (so Collab Chat P5 is shipped/unblocked); recipient shared-notes R1–R4; shared-note surface rework + load-perf fix (~6s stall); chat UI redesign (sliding drawer); tags on standard notes; Tools Phase 2 complete; Notebooks Phase 2 (sidebar tree); Next.js security patch; removed false E2EE/self-hostable claims.

**Mobile implication:** none of the recently shipped touch-sensitive surfaces have browser/E2E coverage, and the parked realtime-security items are exactly what you want settled before a second client opens the same channels.

---

## 2. Data access — what mobile depends on

Notes live in **two** stores by auth state (`src/app/actions/notes.ts` → `noteOperation("redis"|"supabase", ...)`). Per Decision 1, mobile ignores the Redis path entirely (local = SQLite, cloud = Supabase).

### Group (a) — mobile calls Supabase directly under RLS (no new backend)
`@supabase/supabase-js` runs in RN; RLS already enforces ownership:
- Signed-in note CRUD (`supabaseActions.ts`: create/update/title/pin/privacy/order/trash/restore/retention)
- Notebooks, tags, versions, user settings, notifications, writing sessions, subscription read.
- **Caveat:** tier limits (collab allowance, notebook cap) are enforced in server-action _code_, not RLS. A direct-to-Supabase client bypasses that → move the important gates into the DB (see Sequence step c).

### Group (b) — needs a dedicated endpoint (service role / R2 signing / Stripe / AI / cross-user)
Secrets must never reach the device:
- **Sharing** (`sharing.ts`) — cross-user service-role writes.
- **Collab chat + Yjs** (`chatActions`, `collabActions`, `/api/collab`, `/api/chat-unread`) — service role + R2 presigned media.
- **R2 upload/signing** — avatars, notebook covers, chat media, export downloads.
- **Stripe** (billing portal, account-deletion sub-cancel, webhook); **AI** (`/api/ai/*`, Anthropic key); **QStash export worker**; **admin/cron**; **Resend** contact email; **roadmap voting** (anon cookie identity).
- _(Redis/anon path — `/api/notes-revision`, `/api/user-activity`, `recoveryActions` — NOT built for mobile per Decision 1.)_

### Biggest Next-only coupling: cookie-based auth
`createClient()` reads the session from `next/headers` `cookies()`; every group-(a) route and server action gets identity that way. Mobile has no cookie jar, so **existing API routes won't "just work"** — group (b) needs bearer-token (`Authorization: Bearer <jwt>`) handling. Other Next couplings (`revalidatePath`, `middleware` session refresh, `redirect` in auth flows, server-component data fetching) are no-ops on mobile or replaced by the Supabase SDK + deep links.

**Recommendation:** thin bearer-authed API layer for exactly the group-(b) set; mobile hits Supabase directly for group (a). Don't dual-purpose the cookie routes.

---

## 3. Sync engine — core/adapter split

No dedicated directory — spread across `src/hooks` (React glue), `src/utils` (logic + IDB), `src/stores` (Zustand), `src/app/actions`. The _decision logic_ is already pure and unit-tested; browser coupling is concentrated in a few named functions.

### Browser deps to replace on mobile
| Browser API | Where | Mobile replacement |
|---|---|---|
| IndexedDB (hand-rolled) | `offline-queue.ts`, `notes-idb-cache.ts`, `notes-backup.ts` | SQLite (`expo-sqlite` / op-sqlite) |
| BroadcastChannel | `cross-tab.ts` | No-op / in-process event bus |
| Web Locks (`navigator.locks`) | `cross-tab.ts`, `use-notes-operations.tsx` | In-process mutex (has a fallback already) |
| localStorage | init flag, UI prefs, guest `notes_user_id` | AsyncStorage / SecureStore |
| `navigator.onLine` + events | `use-online-status.ts` | `@react-native-community/netinfo` |
| `beforeunload`/`visibilitychange`/focus | `use-auto-save.tsx`, `use-notes-sync.ts` | RN `AppState` |
| Supabase Realtime | `use-notes-sync.ts`, `yjs-supabase-provider.ts` | Works in RN as-is |
| `crypto.randomUUID`, `btoa`/`atob` | `cross-tab.ts`, yjs provider | Polyfills |

### Already pure — lift verbatim into `@justnoted/sync-core`
- `reconcileNotes` (`notes-merge.ts`) — version-based merge (empty-server never clobbers local; conflict → "(conflicted copy)").
- `resolveWrite` (`version-resolve.ts`) — CAS / projection / legacy write decision.
- `decideEditorChange` (`editor-save-decision.ts`) — open-never-edits guardrail.
- Enqueue dedup/collapse rules + backoff math (extract from the IDB code).
- Type converters, content-equality/sort helpers.

### Proposed split
- **Core (pure TS):** the above + a framework-agnostic `SyncController` (in-memory note map + in-flight sets; `save/create/delete/reconcile/drainQueue`) depending on interfaces — `LocalStore`, `OutboxStore`, `Broadcaster`, `Mutex`, `NetworkMonitor`, `RealtimeSource`, `Backend`. Controller must not import Zustand.
- **Web adapter:** existing IDB / BroadcastChannel / Web-Locks / Realtime code, mostly as-is.
- **Mobile adapter:** SQLite `LocalStore` + `OutboxStore` (op-queue table `{id, payload JSON, timestamp, retryCount, lastAttempt}`, index on noteId); netinfo; AppState; Supabase Realtime; polyfills.

The CAS model (`baseVersion` sent client-side, server applies only if `version === base`) and the hydration-lock logic (`hasServerSynced`, 5s UI time-box, `baseVersionRef` pinning) are server/decision logic — they port cleanly. The refactor is mostly _extraction_, not redesign. Leave `notes-backup.ts` and the yjs provider as later adapters.

---

## 4. Shared code — portable vs tangled

**Already pure plain TS (reuse directly):** all of `src/lib/text-tools/*` except `platform.ts` (`case`, `counts`, `keywords`, `serp`, `slug`, `registry`); `utils/word-count.ts`, `utils/html-utils.ts`, `utils/notes-utils.ts`, **`notes-merge.ts`**, **`version-resolve.ts`**, **`editor-save-decision.ts`**, `lib/plans.ts`, `lib/filter-notes.ts`, `lib/tools/og-parse|og-analyze|image-meta`. Each has a `.test.ts` beside it.

**Portable but carries a dep:** `collab-doc.ts` (needs `yjs` — fine in RN).

**Not portable — don't plan to reuse:** `text-tools/platform.ts` (React hook), `toc-parser.ts` (DOMParser), `sanitize.ts` (dompurify), `html-to-markdown.ts` (turndown — DOM-dependent), `notes-idb-cache.ts` / `offline-queue.ts` (IndexedDB + import server actions), `yjs-supabase-provider.ts` (`"use client"` + window listeners), the `*-client.ts` Supabase wrappers. `lib/tools/ssrf.ts` is Node-only (server-bound regardless).

**Watch-out:** if mobile ever needs HTML→markdown of pasted content, turndown won't run natively — keep that conversion server-side or in the WebView.

---

## 5. Editor

Milkdown (`src/components/editor/milkdown-editor.tsx`, ~676 lines) is ProseMirror throughout — no headless mode, **native reuse impossible**. Per Decision 3 the path is a **WebView host + markdown bridge** (the editor's only contract is `markdown in / onChange(markdown) out`, a narrow interface). This is also the only path that preserves **Yjs collab + chat anchors** (wired through `collabServiceCtx` + `y-prosemirror` relative positions); re-binding those to another editor is large.

- **Collab is shipped and active** — auto-enables when a note is shared with edit rights (`shouldCollab` in `active-note-editor.tsx`). Only the `yjs:` channel _authz_ is parked.
- **Transport:** Supabase Realtime broadcast (no separate WS server); the Supabase JS client works in RN, so a WebView collab editor can use the same transport. The provider's base64/`beforeunload` usage needs polyfills.
- **Offline:** plain notes via IDB cache + outbox; collab notes accumulate in the local Yjs doc and re-exchange full state on reconnect.
- **Native Markdown editor** is viable only for the solo (non-collab) path later, since stored content is canonical Markdown and the widget is swappable — but it loses CRDT + anchors unless re-bound to Yjs. WebView first.

---

## 6. Payments — RevenueCat + entitlement

The entitlement model is well-positioned for a second source. Today it's Stripe-only (Payment Links + Billing Portal), but the **read path is fully source-agnostic**: one pure, tested resolver `resolvePlanTier(row)` (`src/lib/subscription.ts`) reads `tier` (`draft|scribe`), `status`, `plan_source`, `comp_until`. No gating code calls Stripe. `plan_source` already exists (`CHECK IN ('stripe','manual')`).

Adding RevenueCat (per Decision 2 — single row, paid-is-paid):
1. **Widen the `plan_source` CHECK** to allow `revenuecat`/`apple`/`google` (new migration) + add generic `external_customer_id`/`external_subscription_id` columns.
2. **RevenueCat webhook handler** mirroring the Stripe one → upsert `tier`/`status`/period with the new `plan_source`. Verify RC status strings against the resolver's `active|trialing` whitelist (add an explicit resolver arm if they differ).
3. **Ownership rule:** only the `plan_source` that currently owns an active row may downgrade it. Webhook events from a _different_ source must not overwrite an active sub — **log them instead**. **Transfer-on-lapse:** when the owning source lapses, check whether another source is still active and, if so, transfer ownership (`plan_source` + external ids) rather than downgrading; only drop to Draft when no source is active. (This is the core of "paid is paid".)
4. **Paywall guard on both platforms:** read the row first; if already Scribe from another source, show "You already have Scribe" — don't sell.
5. **Manage-billing by `plan_source`:** `getPortalUrl` assumes a Stripe `customer_id`; RC accounts deep-link to App Store / Play subscription settings instead.

Because entitlement is one server-side row read by one resolver, cross-platform sync is essentially free once the write paths and the ownership rule exist.

**Store policy:** digital subscriptions sold in-app must go through IAP (RevenueCat) on iOS/Android; you can't link out to Stripe checkout from inside the app. Web stays Stripe; the `subscriptions` row is the meeting point.

---

## 7. Store requirements

- **In-app account deletion — already shipped** (`accountActions.ts`, 30-day grace). Surface it in the mobile UI.
- **Sign in with Apple — exempt.** Auth is email OTP / magic link only (no social logins), so Apple's "must offer SIWA" rule doesn't apply. (Adding Google sign-in later makes SIWA mandatory on iOS.) The OTP confirm flow needs a mobile deep-link equivalent via the Supabase SDK.
- **Privacy / data-safety labels** — declare account/email, user content (notes), analytics. Notes are **not** E2E encrypted (the false claim was removed from web) — labels must match that reality.
- **Push notifications** — the notifications system is built server-side (schema, inbox, prefs) but in-app only. Mobile push for shares/chat needs: Expo Push (or FCM/APNs) token registration, a device-token table, and a fan-out step at the existing notification-creation points. Net-new backend work.

---

## Sequence (checklist)

**JustSent mobile ships first.** Meanwhile, the JustNoted web track:

### a) Finish the pre-launch bug batch + Playwright
- [x] **B7 — account switching** (first): keep "Switching to <name>…" up until the new account's notes + active note load; flush the current account's pending saves under the current session; never sync/save the previous account's note with the new session. Add a test proving no cross-account write. _(done — commit `8b571e3`, offline-queue account guard + tests.)_
- [x] **B8 + D13#1** (shared cause): id-scoped/shallow store selectors + memoised list rows (`NoteCard`) so the sidebar/editor stop repainting every row on every keystroke. **B8** = a new note must appear in the sidebar immediately; **D13#1** = the keystroke-lag it shared a cause with. _(done — commit `9ecd803`. The B8 symptom no longer reproduced ANONYMOUSLY, but it was originally reported SIGNED IN (cloud); the keystroke-lag fix is the substantive change. Local acceptance test passes now; a signed-in B8 variant is added to the cloud specs, running once `E2E_ACCOUNTS` is set. User is verifying the signed-in case manually. Measured: typing with 3 notes dropped `NoteCard` repaints from ~18 to 4.)_
- [ ] **C9–C12** chat polish: floating right-edge chat button w/ unread badge; image draft attachment; audio draft; composer auto-grow + buttons on their own row.
- [ ] **E1** keyboard note switching (Ctrl+Alt+↑/↓, Ctrl+Alt+0–9) — focus editor, caret at end, must not count as an edit, must not steal focus from search/dialogs.
- [ ] **E2** first-line titles: "New note" until typing; title follows first line (strip markdown, ~80 chars) until edited manually; local + cloud.
- [ ] **F3** remember last view per browser, keyed per account; restore view + open last/top note on load.
- [ ] **Playwright** E2E harness for core flows (create-note appears; keyboard switch → type at once; rail nav closes overlays; account-switch "Switching…"; two-context collab). Ongoing process change.

### b) Realtime authz
- [ ] Run the presence verify script (`scripts/verify-realtime-presence.mjs`) with 2 test accounts, then flip `NEXT_PUBLIC_PRIVATE_REALTIME` on. _(User-run.)_
- [ ] yjs two-topic private-channel migration (`yjs:<id>` doc updates + `yjsctl:<id>` control/awareness); add `can_edit_note_live` + policies; gate client behind the flag. **Do this before mobile opens these channels.**

### c) Tier enforcement into RLS/DB
- [ ] Move collab allowance and notebook cap enforcement into RLS/DB so a direct-to-Supabase mobile client can't bypass them.

### d) Subscription schema (per Decision 2)
- [ ] Widen `plan_source` CHECK (`revenuecat`/`apple`/`google`); add generic external-id columns.
- [ ] Implement the ownership/downgrade rule (only the owning source can downgrade; cross-source events logged, not applied).
- [ ] **Transfer-on-lapse rule:** when the owning source sends a downgrade/lapse, first check whether another source has an active entitlement; if so, **transfer ownership** (`plan_source` + external ids) to that source instead of downgrading the row. Only downgrade to Draft when no source is active. Add a test covering: (i) owning source lapses, other source active → ownership transfers, tier stays `scribe`; (ii) owning source lapses, no other active → downgrades to `draft`; (iii) non-owning source sends an event → logged, row untouched.

### e) Extract `@justnoted/sync-core`
- [ ] Pull pure decision logic + a `SyncController` behind adapter interfaces; ship on web unchanged first (web adapter wraps existing IDB/BroadcastChannel code) to prove the refactor. Highest-leverage step — the foundation for the mobile sync adapter.

---

## Ready-for-mobile gate

**All of the following must pass before any Expo work starts.** This is the exit criterion for the web track above.

- [ ] **Playwright E2E suite exists** (none today) covering: create/edit/reload a note (local _and_ cloud); new note appears in the sidebar; keyboard switching focuses the editor; rail navigation closes overlays; account switching; move local ↔ cloud; share with edit access + two-context live editing without reload; trash/restore and shared-note access; export; delete/restore account.
- [ ] **Coverage for the October features that shipped without browser tests:** recipient pin/hide/sort/tags/drag-reorder; the unified shared NoteView and split view; the chat drawer; tags on notes.
- [ ] **All pending bug-batch items done:** B7, B8+D13, C9–C12, E1, E2, F3.
- [ ] **Realtime authz complete:** presence verified; yjs private channels live.
- [ ] **Manual end-to-end pass** across the above flows.
- [ ] **Two-week real-use trial** with a few users; any bugs found fixed.

**Starting point:** begin with Playwright setup and the B7 fix.

### Then (mobile build, after JustSent and after the gate passes)
- [ ] Bearer-authed API layer for group (b).
- [ ] Expo app skeleton + Supabase SDK auth (OTP + deep-link) + direct group-(a) reads/writes.
- [ ] Device-only SQLite local notes + one-tap "move to account"; SQLite sync adapter implementing the core interfaces.
- [ ] **Early Expo Go WebView editor prototype** (Decision 3 test list) — prototype _before_ committing the editor approach.
- [ ] RevenueCat purchase flow + webhook + paywall guard + manage-billing deep links.
- [ ] Push notifications (token registration + device-token table + fan-out).
- [ ] Store compliance (privacy/data-safety labels, in-app deletion surfaced, screenshots, review).

**Risk areas:** the sync-core extraction (mitigated — most decision logic is already pure/tested) and the WebView editor's mobile keyboard/selection UX (prototype early in Expo Go).
