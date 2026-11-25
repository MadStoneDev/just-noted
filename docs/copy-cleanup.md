# Copy cleanup: em-dashes and AI-sounding phrasing

**Status (2026-11-26): applied.** Everything below was approved except C12 and B4 (originals kept) and A13/D50 (dropped, since the unused components were deleted). H1 and H3 were applied (login-code email included; "JustNoted" everywhere). H4 was applied with factual rewrites of The How and the landing card (local notes live on the server under a browser ID; Trash 30 days on Draft, 60 or 90 on Scribe; backups roll over in about 30 days). The landing card says "Encrypted in transit." only. The other "at rest" claims (privacy policy lines 189 and 425, `settings/security-section.tsx:49`) are unchanged, pending a decision. `src/user-facing-copy.test.ts` now fails on any em-dash or spaced en-dash in user-facing strings.

**How the scan was done.** Every `—`, spaced ` – `, `&mdash;` and `&ndash;` in `src/` and `public/`, minus code comments, plus a scan for the listed vocabulary, exclamation marks, question openers and US spellings in user-facing strings. Code comments, `docs/`, SQL migrations and `console.*` log messages are left alone.

**Result of the vocabulary scan.** No hits for seamless, effortless, elevate, unlock, supercharge, empower, dive in, journey, robust, leverage or the usual relatives. The phrasing work is mostly in The How / The What and a handful of exclamation marks.

Rule of thumb used for dashes: a dash joining two sentences becomes a full stop; one introducing a list or label becomes a colon; an aside becomes commas or brackets. Unspaced en-dashes in ranges (`Title A–Z`, `Sort A–Z`) are correct and stay.

## A. Page titles, metadata and OpenGraph

The root layout already uses `Page | JustNoted`, so titles follow that.

| ID | file:line | Current | Proposed |
|---|---|---|---|
| A1 | src/app/(app)/notebooks/[id]/page.tsx:7 | `Notebook — JustNoted` | `Notebook \| JustNoted` |
| A2 | src/app/(app)/notebooks/page.tsx:6 | `Notebooks — JustNoted` | `Notebooks \| JustNoted` |
| A3 | src/app/(app)/pricing/page.tsx:9, 13, 22 | `Plans & Pricing — JustNoted` (×3) | `Plans & Pricing \| JustNoted` |
| A4 | src/app/(app)/roadmap/page.tsx:7 | `Roadmap — JustNoted` | `Roadmap \| JustNoted` |
| A5 | src/app/(app)/the-how/page.tsx:7 | `The How — JustNoted` | `The How \| JustNoted` |
| A6 | src/app/(app)/the-what/page.tsx:7 | `The What — JustNoted` | `The What \| JustNoted` |
| A7 | src/app/welcome/page.tsx:18 | `JustNoted — Distraction-Free Note Taking` | `JustNoted \| Distraction-Free Note Taking` |
| A8 | src/app/welcome/page.tsx:20 | `Write, organize, share.` | `Write, organise, share.` |
| A9 | src/app/(app)/tools/page.tsx:19 | alt `JustNoted — free online writing tools` | `JustNoted: free online writing tools` |
| A10 | src/app/layout.tsx:56 | alt `JustNoted — distraction-free note taking` | `JustNoted: distraction-free note taking` |
| A11 | src/app/privacy-policy/page.tsx:10 | `…what you can do about it — in plain English.` | `…what you can do about it, in plain English.` |
| A12 | src/app/profile/page.tsx:14, 17, 33 | `Your profile on JustNoted - Distraction-Free Note Taking` (spaced hyphen used as a dash) | `Your JustNoted profile` |
| A13 | src/components/note-block/note-toolbar.tsx:62 | `<title>${note.title} — JustNoted</title>` (unused component, see H2) | `<title>${note.title} \| JustNoted</title>` |

## B. Landing, pricing and plan copy

| ID | file:line | Current | Proposed |
|---|---|---|---|
| B1 | src/app/welcome/page.tsx:43 | `Organize with notebooks, sync across devices, share with anyone.` | `Organise with notebooks, sync across devices, share with anyone.` |
| B2 | src/app/welcome/page.tsx:50 | `Get Started — Free` | `Get Started Free` |
| B3 | src/app/welcome/page.tsx:83 | `Organize notes into notebooks…` | `Organise notes into notebooks…` |
| B4 | src/app/welcome/page.tsx:103 | `Your notes are yours. Encrypted in transit and at rest. Mark any note…` | `Encrypted in transit and at rest. Mark any note…` |
| B5 | src/app/welcome/page.tsx:108 | `No menus, no chrome. Just you and your words. Focus mode hides everything.` | `No menus, no clutter. Focus mode hides everything.` |
| B6 | src/components/pricing-view.tsx:53 | `Welcome to Scribe! It can take a few seconds to switch on.` | `Welcome to Scribe. It can take a few seconds to switch on.` |
| B7 | src/components/pricing-view.tsx:197 | `…billing isn’t available right now — choose {Monthly} or try again later.` | `…billing isn’t available right now. Choose {Monthly} or try again later.` |
| B8 | src/components/pricing-view.tsx:203 | `Checkout is being set up — the button goes live once billing is configured.` | `Checkout is being set up. The button goes live once billing is configured.` |
| B9 | src/components/pricing-view.tsx:227 | `…or A$70/year for the year — that’s two months free. You choose when you upgrade.` | `…or A$70/year for the year (two months free). You choose when you upgrade.` |
| B10 | src/components/pricing-view.tsx:239 | `No. Writing and keeping notes — including local notes on your device — is always free.` | `No. Writing and keeping notes, including local notes on your device, is always free.` |
| B11 | src/lib/plans.ts:96 | `No GST is charged — RAVENCI Solutions isn't registered for GST.` | `No GST is charged. RAVENCI Solutions isn't registered for GST.` |
| B12 | src/lib/plans.ts:119 | `Live collaboration — share notes others can edit` | `Live collaboration: share notes others can edit` |
| B13 | src/lib/plans.ts:146 | `Your notebooks stay — you just can't create new ones past 10.` | `Your notebooks stay, but you can't create new ones past 10.` |
| B14 | src/components/settings/billing-section.tsx:175 | `Note-taking and sharing — free forever.` | `Note-taking and sharing, free forever.` |
| B15 | src/components/settings/billing-section.tsx:179 | `Complimentary — no billing to manage.` | `Complimentary. No billing to manage.` |
| B16 | src/components/settings/billing-section.tsx:219 | `You're on Draft now — what changed` | `You're on Draft now: what changed` |
| B17 | src/components/settings/billing-section.tsx:245 | `Share notes others can edit — with live collaboration` | `Share notes others can edit, with live collaboration` |
| B18 | src/components/settings/billing-section.tsx:267 | `…billing isn’t available right now — choose…` | `…billing isn’t available right now. Choose…` |
| B19 | src/components/settings/billing-section.tsx:272 | `Checkout is being set up — the button will be live once billing is configured.` | `Checkout is being set up. The button will be live once billing is configured.` |
| B20 | src/lib/billing-client.ts:22 | `There's a problem with your current subscription — open Manage billing to fix it.` | `There's a problem with your current subscription. Open Manage billing to fix it.` |
| B21 | src/lib/billing-client.ts:26 | `Checkout isn’t available yet — billing is still being set up.` | `Checkout isn’t available yet. Billing is still being set up.` |
| B22 | src/lib/manual-scribe.ts:37 | `This account has a live Stripe subscription — cancel it in Stripe before granting Scribe manually.` | `This account has a live Stripe subscription. Cancel it in Stripe before granting Scribe manually.` |
| B23 | src/lib/manual-scribe.ts:69 | `This Scribe plan is billed through Stripe — cancel it in Stripe instead.` | `This Scribe plan is billed through Stripe. Cancel it in Stripe instead.` |
| B24 | src/data/roadmap.ts:43 | `Export, print and version history on every shared note — not just your own.` | `Export, print and version history on every shared note, not just your own.` |
| B25 | src/data/roadmap.ts:62 | `Organise as much as you like — no notebook cap on Scribe.` | `Organise as much as you like. No notebook cap on Scribe.` |
| B26 | src/data/roadmap.ts:67 | `Deleted notes wait in Trash before they're gone — 30 days on Draft, up to 90 on Scribe.` | `Deleted notes wait in Trash before they're gone: 30 days on Draft, up to 90 on Scribe.` |
| B27 | src/data/roadmap.ts:77 | `When a new version ships, we'll offer a refresh — and save your note first.` | `When a new version ships, we'll offer a refresh and save your note first.` |
| B28 | src/lib/text-tools/registry.ts:171 | `Nothing is stored — no cache, no log of what you tested.` | `Nothing is stored: no cache, no log of what you tested.` |

## C. Help pages (The How, The What)

These are written in your first-person voice, so I've only touched dashes and the lines that read as filler. Emojis and "Hear me out" stay.

| ID | file:line | Current | Proposed |
|---|---|---|---|
| C1 | src/components/the-how-view.tsx:70 | `A quick tour of the features — use what you need, ignore the rest.` | `A quick tour of the features. Use what you need, ignore the rest.` |
| C2 | src/components/the-how-view.tsx:88 | `Creating a note on JustNoted couldn't be easier. When you first load…` | `Creating a note on JustNoted is easy. When you first load…` |
| C3 | src/components/the-how-view.tsx:123 | `Local Notes are perfect for quick, anonymous note-taking.` | `Local Notes are for quick, anonymous note-taking.` |
| C4 | src/components/the-how-view.tsx:125 | `…tied to your specific device and browser – no account required.` | `…tied to your specific device and browser. No account required.` |
| C5 | src/components/the-how-view.tsx:127–128 | `Think of them as your private scratchpad that's always ready when you need it.` | (delete the sentence) |
| C6 | src/components/the-how-view.tsx:137 | `Both types save automatically and work exactly the same way – the only difference is where…` | `Both types save automatically and work the same way. The only difference is where…` |
| C7 | src/components/the-how-view.tsx:165 | `Need to take your note elsewhere? Just click/tap the [txt] button…` | `To take your note elsewhere, click/tap the [txt] button…` |
| C8 | src/components/the-how-view.tsx:169–170 | `These files can be opened on virtually any device, so your thoughts are always portable.` | `These files open on almost any device.` |
| C9 | src/components/the-how-view.tsx:182 | `Really forever – I don't keep backups of deleted notes…` | `Really forever. I don't keep backups of deleted notes…` (see H4) |
| C10 | src/components/the-how-view.tsx:197 | `…different covers – solid colours, gradients, or photos.` | `…different covers: solid colours, gradients or photos.` |
| C11 | src/components/the-how-view.tsx:201–203 | `Don't want to use notebooks? That's completely fine. Your notes will just live in "All Notes" like they always have. The feature is there when you need it, invisible when you don't 🤷‍♂️.` | `Notebooks are optional. Your notes will just live in "All Notes" like they always have 🤷‍♂️.` |
| C12 | src/components/the-how-view.tsx:210–212 | `Ever been writing something and needed to check another note? Used to be you'd have to scroll up, lose your place, scroll back down, forget what you read, scroll up again... you get it.` | `Checking another note mid-write used to mean scrolling up, losing your place, scrolling back down, forgetting what you read, scrolling up again... you get it.` |
| C13 | src/components/the-how-view.tsx:216 | `…divides in two – your current note on one side, a reference note on the other.` | `…divides in two: your current note on one side, a reference note on the other.` |
| C14 | src/components/the-how-view.tsx:231–232 | `If you're writing something longer – maybe an article, a story, or just a really detailed plan – the table of contents…` | `If you're writing something longer (an article, a story, a detailed plan), the table of contents…` |
| C15 | src/components/the-how-view.tsx:237–238 | `It's genuinely useful for longer pieces, and completely ignorable for quick notes.` | `Handy for longer pieces, easy to ignore for quick notes.` |
| C16 | src/components/the-how-view.tsx:253–254 | `Got a bunch of notes that need to move to a notebook? You don't have to do them one by one.` | `You don't have to move notes to a notebook one by one.` |
| C17 | src/components/the-how-view.tsx:262 | `…somewhere else – maybe you're backing up a project…` | `…somewhere else. Maybe you're backing up a project…` |
| C18 | src/components/the-how-view.tsx:284 | `…for local notes – none of that is tied to your notes.` | `…for local notes. None of that is tied to your notes.` |
| C19 | src/components/the-how-view.tsx:295 | `Your data is yours, and when you say it's gone, it's truly gone.` | `When you say it's gone, it's gone.` |
| C20 | src/components/the-what-view.tsx:47–48 | `…if you're looking for a bit more detail then, by all means, please read on.` | `…if you're looking for a bit more detail, read on.` |
| C21 | src/components/the-what-view.tsx:54 | `…something that just works – you visit the page and immediately start typing.` | `…something that just works: you visit the page and immediately start typing.` |
| C22 | src/components/the-what-view.tsx:62 | `…how you want to access them – keep notes local…` | `…how you want to access them. Keep notes local…` |
| C23 | src/components/the-what-view.tsx:84 | `That's how JustNoted was born – my answer to overcomplicated note-taking apps.` | `That's how JustNoted was born: my answer to overcomplicated note-taking apps.` |
| C24 | src/components/the-what-view.tsx:89 | `Now, I'll be honest – since launching JustNoted, I've added…` | `Now, I'll be honest. Since launching JustNoted, I've added…` |
| C25 | src/components/the-what-view.tsx:91–92 | `But here's the thing: you don't have to use any of it.` | `But you don't have to use any of it.` |
| C26 | src/components/the-what-view.tsx:98–99 | `I would love for this project to serve as many people as possible while remaining simple and intuitive 🙌.` | `I'd love it to help as many people as possible while staying simple 🙌.` |

## D. Toasts, errors, empty states and UI labels

| ID | file:line | Current | Proposed |
|---|---|---|---|
| D1 | src/app/actions/chatActions.ts:101, 136 | `You're sending messages too fast — slow down a moment.` | `You're sending messages too fast. Slow down a moment.` |
| D2 | src/app/actions/roadmapActions.ts:129 | `Couldn't submit — please try again.` | `Couldn't submit. Please try again.` |
| D3 | src/app/error.tsx:42 | `Your notes are safe — try refreshing.` | `Your notes are safe. Try refreshing.` |
| D4 | src/components/error-boundary.tsx:78 | `Oops! Something went wrong` | `Something went wrong` |
| D5 | src/components/error-boundary.tsx:83 | `Don't worry — your notes are safe and automatically saved.` | `Your notes are safe and saved automatically.` |
| D6 | src/components/account-menu.tsx:81, src/components/mobile-account-drawer.tsx:49, src/components/settings-view.tsx:265 | `That session expired — sign in again to reconnect it.` | `That session expired. Sign in again to reconnect it.` |
| D7 | src/components/account-menu.tsx:164, src/components/mobile-account-drawer.tsx:132, src/components/settings-view.tsx:303 | `session expired — sign in` | `session expired: sign in` |
| D8 | src/components/account-switch-modal.tsx:61 | `Hang on — these finish uploading before the switch so nothing is lost.` | `Hang on. These finish uploading before the switch so nothing is lost.` |
| D9 | src/components/active-note-editor.tsx:1941 | tooltip `…close it there to edit here — this tab follows along.` | `…close it there to edit here. This tab follows along.` |
| D10 | src/components/active-note-editor.tsx:1946 | tooltip `Still syncing — you can edit now; your changes save as soon as it finishes.` | `Still syncing. You can edit now; your changes save as soon as it finishes.` |
| D11 | src/components/active-note-editor.tsx:1950 | tooltip `Your last edit hasn't been saved yet — it's queued and will retry` | `Your last edit hasn't been saved yet. It's queued and will retry.` |
| D12 | src/components/admin-view.tsx:164, 167, 238, 241, 479 | `Action failed — try again.` | `Action failed. Try again.` |
| D13 | src/components/admin-view.tsx:499 | `Metadata only — note content isn't shown here. Newest 100.` | `Metadata only. Note content isn't shown here. Newest 100.` |
| D14 | src/components/goal-suggestions-modal.tsx:190 | `` `${min} – ${max} ${tab}` `` (spaced en-dash in a range) | `` `${min}–${max} ${tab}` `` |
| D15 | src/components/note-view/note-view.tsx:126 | `Wide view (all notes) — click to reset` | `Wide view (all notes). Click to reset.` |
| D16 | src/components/note-view/note-view.tsx:128 | `Wide view (this note) — click to apply to all` | `Wide view (this note). Click to apply to all.` |
| D17 | src/components/notebook-nav-list.tsx:333 | `You’re at {n} notebooks — go unlimited with Scribe` | `You’re at {n} notebooks. Go unlimited with Scribe` |
| D18 | src/components/notes/note-card.tsx:77 | `Conflicted copy — review` | `Conflicted copy: review` |
| D19 | src/components/settings-view.tsx:615 | `Changes the editor body and title only — the rest of the app stays as is.` | `Changes the editor body and title only. The rest of the app stays as is.` |
| D20 | src/components/settings/account-export-section.tsx:54 | `Preparing your export — we’ll email you when it’s ready.` | `Preparing your export. We’ll email you when it’s ready.` |
| D21 | src/components/settings/account-export-section.tsx:80 | `Download a complete copy of your account — notes, notebooks, tags…` | `Download a complete copy of your account: notes, notebooks, tags…` |
| D22 | src/components/settings/device-notes-section.tsx:101 | `Keep it somewhere safe — anyone with it can read your device notes.` | `Keep it somewhere safe. Anyone with it can read your device notes.` |
| D23 | src/components/settings/device-notes-section.tsx:111 | `Save this now — it won't be shown again.` | `Save this now. It won't be shown again.` |
| D24 | src/components/settings/device-notes-section.tsx:131 | `…so it can't be shown again — regenerate to create a new one.` | `…so it can't be shown again. Regenerate to create a new one.` |
| D25 | src/components/share-note-button.tsx:52 | `No link — pick an access level to create one.` | `No link. Pick an access level to create one.` |
| D26 | src/components/share-note-button.tsx:88 | `Collaboration is a Scribe feature — upgrade in Settings › Plan & usage.` | `Collaboration is a Scribe feature. Upgrade in Settings › Plan & usage.` |
| D27 | src/components/share-note-button.tsx:217 | `` `Stopped sharing — ${n} people lost access` `` | `` `Stopped sharing. ${n} people lost access` `` |
| D28 | src/components/share-note-button.tsx:287 | title `Let people edit with Scribe — see plans` | `Let people edit with Scribe. See plans` |
| D29 | src/components/share-note-button.tsx:370 | `Become a Scribe to let people edit — real-time collaboration & more.` | `Become a Scribe to let people edit (real-time collaboration & more).` |
| D30 | src/components/shared-nav-list.tsx:551 | placeholder `Paste a link — justnoted.app/n/…` | `Paste a justnoted.app/n/… link` |
| D31 | src/components/sidebar/index.tsx:599 | `Upload failed — check browser console for details.` | `Upload failed. Check the browser console for details.` |
| D32 | src/components/sidebar/index.tsx:1448 | `Two versions of this note diverged — open it to review and merge.` | `Two versions of this note diverged. Open it to review and merge.` |
| D33 | src/components/sidebar/index.tsx:1461 | `{statusLabel} — {statusDesc}` | `{statusLabel}: {statusDesc}` |
| D34 | src/components/sidebar/index.tsx:1471 | `Local — kept only in this browser…` | `Local: kept only in this browser…` |
| D35 | src/components/sidebar/index.tsx:1479 | `Cloud — synced to your account…` | `Cloud: synced to your account…` |
| D36 | src/components/sidebar/index.tsx:1485 | `Moving a note keeps its title and content — it only changes where it's stored.` | `Moving a note keeps its title and content. It only changes where it's stored.` |
| D37 | src/components/sign-out-dialog.tsx:142 | `Sign out anyway — {n unsaved notes} will be lost` | `Sign out anyway ({n unsaved notes} will be lost)` |
| D38 | src/components/signed-out-notice.tsx:55 | `You’ve been signed out — sign in to sync {notes}.` | `You’ve been signed out. Sign in to sync {notes}.` |
| D39 | src/components/trash-view.tsx:192 | `…wait in Trash for 30 days — no credit card needed.` | `…wait in Trash for 30 days. No credit card needed.` |
| D40 | src/components/ui/offline-indicator.tsx:28 | `Sync problem — your changes are saved on this device and will sync when it clears.` | `Sync problem. Your changes are saved on this device and will sync when it clears.` |
| D41 | src/components/ui/offline-indicator.tsx:70 | `Offline — changes saved locally` | `Offline: changes saved locally` |
| D42 | src/components/update-available-banner.tsx:97 | `Refresh to get the latest — your note is saved first.` | `Refresh to get the latest. Your note is saved first.` |
| D43 | src/components/version-history-panel.tsx:160 | `Filter history by date range — a Scribe feature` | `Filter history by date range (a Scribe feature)` |
| D44 | src/components/tools/word-counter.tsx:116 | `Over 200,000 words — stats may lag.` | `Over 200,000 words. Stats may lag.` |
| D45 | src/hooks/use-notes-operations.tsx:825, src/utils/background-conflict.ts:97, src/utils/redis/note-store.ts:71 | note title `Untitled (conflicted copy — 11 Nov)` | `Untitled (conflicted copy, 11 Nov)` (detection matches `/conflicted copy/i`, so existing copies are still recognised) |
| D46 | src/components/roadmap-view.tsx:122 | `Thanks! Your suggestion was sent for review.` | `Thanks. Your suggestion was sent for review.` |
| D47 | src/components/profile-block.tsx:205 | `Profile created successfully!` | `Profile created.` |
| D48 | src/components/backup-manager.tsx:149 | `` `Note "${t}" restored successfully! The note content has been updated.` `` | `` `Note "${t}" restored. The note content has been updated.` `` |
| D49 | src/components/backup-manager.tsx:233 | `Backup exported successfully! The file contains all your notes in readable format.` | `Backup exported. The file contains all your notes in readable format.` |
| D50 | src/constants/app.ts:74 | `Transfer complete!` | `Transfer complete` |
| D51 | src/app/get-access/actions.ts:17 | `Oops! No email? Try again.` | `Please enter your email.` |

## E. Emails

| ID | file:line | Current | Proposed |
|---|---|---|---|
| E1 | src/app/actions/emailActions.ts:127 | preheader `Thanks for reaching out — we've got your message.` | `Thanks for reaching out. We've got your message.` |
| E2 | src/app/actions/emailActions.ts:135 | `If you didn't contact Just Noted, you can safely ignore this email — no action is needed.` | `If you didn't contact Just Noted, you can safely ignore this email.` |
| E3 | src/app/actions/emailActions.ts:278 | subject `Thank you for contacting Just Noted!` | `Thanks for contacting Just Noted` |
| E4 | src/app/actions/emailActions.ts:25 | `Oops! Our carrier pigeons got lost in the digital storm. Please try again.` | `Our carrier pigeons got lost in the digital storm. Please try again.` |
| E5 | src/app/actions/emailActions.ts:27 | `Houston, we have a problem! Your message got sucked into a black hole. One more try?` | `Houston, we have a problem. Your message got sucked into a black hole. One more try?` |
| E6 | src/app/actions/emailActions.ts:31 | `…instead of 'beep-boop'. Please re-submit!` | `…instead of 'beep-boop'. Please re-submit.` |

E4–E6 keep your rotating joke messages and only drop the `!`. If you'd rather, I can replace all ten with one plain line (`Your message didn't send. Please try again.`), which fits the plain tone better. Say "E-plain" to pick that.

## F. Legal pages (punctuation only, meaning unchanged)

There's no terms page in the repo, only the privacy policy.

| ID | file:line | Current | Proposed |
|---|---|---|---|
| F1 | src/app/privacy-policy/page.tsx:300 | `…never send the text you type anywhere &mdash; it stays on your device.` | `…never send the text you type anywhere. It stays on your device.` |
| F2 | src/app/privacy-policy/page.tsx:309 | `…we only fetch public websites &mdash; private and internal addresses are refused.` | `…we only fetch public websites. Private and internal addresses are refused.` |

## G. Kept as-is (will be allowlisted in the test)

| file:line | Text | Why it stays |
|---|---|---|
| src/components/admin-view.tsx:296, 520, 522; src/components/profile-block.tsx:433; src/lib/plans.ts:212 | `"—"` on its own | Standard empty-cell placeholder in tables and stats, not prose. |
| src/components/version-history-panel.tsx:136 | `–` on its own between two date inputs | Range separator, not prose. |
| src/lib/filter-notes.ts:18, src/components/shared-nav-list.tsx:45, src/components/sidebar/index.tsx:1324, src/components/tools/case-converter.tsx:57 | `Title A–Z`, `Sort A–Z` | Unspaced en-dash in a range is correct and not flagged. |
| src/app/actions/billingActions.ts:42, src/hooks/use-notes-sync.ts:357 | `console.*` messages | Server and dev logs, not shown to users. The test will skip `console.*` arguments. |

## H. Out of scope, flagged for you

1. **Live login email lives in `docs/`.** `docs/email-templates/login-code.html` is the Supabase login-code email and has 4 em-dashes in user-facing text (subject `{{ .Token }} — Your Just Noted login code`, preheader, body, footer). You said to ignore `docs/`, so I've left it. Changing it also means re-pasting it into the Supabase dashboard. Want me to include it?
2. **Unused code.** `src/components/note-block/**`, `src/components/ui/ai-analysis.tsx` and `src/hooks/use-ai-analysis.ts` aren't imported anywhere. A13 and D50 touch that area. I'd still apply the em-dash fix there so the test can scan all of `src/` without special cases, but I've left their exclamation marks (`New note!`, `Done!`, `Added at top!`, etc.) alone. Deleting the dead code is a separate job.
3. **Brand spelling is mixed.** Emails say "Just Noted", the app says "JustNoted". I haven't changed either.
4. **Possible factual mismatch (not a copy-style issue).** The How (line ~182 and ~294) says deleted notes are "gone forever" with no backups, while Trash keeps signed-in users' deleted notes for 30 to 90 days. The landing page (B4 area) says local-only notes "never leave your device", while The How says local notes are stored in a database against a browser token. Worth a look before launch, but I haven't changed the meaning.

## After approval

- Apply the approved rows.
- Update the tests that assert the old strings (`src/utils/queued-edit-conflict.test.ts:143, 250` for D45, plus any plan/billing copy assertions).
- Add `src/user-facing-copy.test.ts`. It parses every non-test `.ts`/`.tsx` file in `src/` with the TypeScript compiler, so comments are skipped automatically. It checks string literals, template literals and JSX text for `—`, `&mdash;`, `&#8212;` and spaced en-dashes (` – `, `&ndash;`), skips `console.*` arguments, and allowlists the standalone placeholders in section G. A failure lists `file:line` and the offending text.
- Run `npm test` and `npx tsc --noEmit`, commit to `prelaunch/playwright-and-b7`, push. No deploy.
