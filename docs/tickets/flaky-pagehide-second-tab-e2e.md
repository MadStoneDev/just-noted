# Flaky E2E: "text typed just before closing the tab is kept (pagehide, second tab)"

- **Status:** open. Seen 2026-11-26 in the full E2E run for the quick-fixes batch (commit `4824ffe`).
- **Severity:** medium until explained. It's a test of the save path that protects text typed in the last moment before closing a tab. It could be a timing-sensitive test, or a real intermittent loss of that text under load. Not yet known which.
- **Area:** `e2e/core-flows.spec.ts:188` (notes, local (Redis, anonymous)). App side: the leave-save on `pagehide` (`src/utils/leave-save.ts`, `persistForLeave` in `src/hooks/use-notes-operations.tsx`) and the other tab's focus refresh (`src/hooks/use-notes-sync.ts`).

## What the test does

Persistent Chromium profile, guest notes. Tab 1 creates a note and waits
2.5s for the create to land. Tab 2 loads (holding the note without the text).
Tab 1 types a marker and closes at once (`runBeforeUnload: true`), inside the
editor's debounce. Then:

1. Tab 2 confirms it heard tab 1's `pagehide` over a BroadcastChannel.
2. Tab 2 doesn't show the marker yet.
3. **Case 1:** after 5.5s, tab 2 gets a `focus` event (full refresh). Its note
   card must show the marker within 20s.
4. Then a reload of tab 2, and a full browser restart, must still show it.

## What I saw

Full suite (`npm run test:e2e`, prod build, 2 workers, 90 tests): failed at
step 3 (Case 1). Steps 1 and 2 passed, so the close did run the unload path.

```
Locator: locator('[data-note-card="9daa2d92-e451-4e23-be14-7b03ebac6ed1"]')
Expected substring: "e2e-close-1795630219509"
Received string:    "1New Note #1Empty noteOn this devicejust now"
Timeout: 20000ms
  43 × locator resolved to … unexpected value "1New Note #1Empty noteOn this devicejust now"
at e2e/core-flows.spec.ts:241
```

So for 20s after the focus refresh, tab 2 still had the note as empty:
the closing tab's text never reached the server (or tab 2's cache) in a form
tab 2 picked up. The test took 29.5s and failed on the first attempt (no
retries locally).

Re-run alone right after, the same test passed **3/3** (`--repeat-each=3`,
about 13.6s each), on a fresh prod build of the same code. It also passed in
earlier full runs on this branch. Nothing in the batch touched the leave-save,
the queue or the refresh path.

The failing run's trace/video were overwritten by the re-run's
`test-results/` folders, so there's no artifact. Next time, keep
`test-results/` from the failing run (or run with `--retries=0 --trace=on`).

## Hypotheses (to check)

1. **The leave-save didn't land under load.** With 2 workers and a busy prod
   server, the `pagehide` save (`sendBeacon`/keepalive fetch) may be dropped
   or arrive after tab 2's refresh, and nothing makes tab 2 refresh again
   inside the 20s window. Check the server log for the leave-save request in a
   failing run.
2. **The text only reached IndexedDB, and tab 2's refresh doesn't adopt it.**
   If the closing tab wrote the text to the shared IDB cache (`localEdit`) but
   not to the server, tab 2's refresh may have taken the server copy (empty)
   without merging the cached local edit, until a reload.
3. **Timing in the test.** The 5.5s wait is meant to clear the 5s
   min-refresh gap since tab 2 loaded; under load, tab 2's load may finish
   late, so the focus refresh is skipped as "too soon" and nothing else
   refreshes in 20s.

If (3) explains it, fix the test (wait for a refresh to actually run, or poll
`focus`). If (1) or (2), it's a real way to lose the last words typed, and
belongs in the leave-save path.

## Done when

- The cause is known (one of the above or another), from a failing run with
  a trace and server log.
- The test passes 20/20 with `--repeat-each=20` alongside the full suite's
  load (or 2 workers).

## Findings (2026-11-26, diagnosis only — no app change yet)

Diagnostic spec: `e2e/diag-pagehide.spec.ts` (skipped unless `E2E_DIAG=1`;
see its header for `E2E_DIAG_CPU` / `E2E_DIAG_REPEAT`). It records network,
console, the server copy (Valkey / Supabase), the surviving tab's IDB queue,
cache and Web Locks, and — via an init-script probe — which IDB writes and
fetches the closing page actually got done.

Load: 14 busy-loop processes on the 16-core box, 4 workers, prod build.

| Run | Result |
| --- | --- |
| Original core-flows test, `--repeat-each=20` | **10/20 failed**, all at `:241` (Case 1), same "Empty note" as above |
| Replica, guest, ×20 (two runs) | Case 1 failed 6/20 and 7/20 |
| Guest: type, close within 0.5s, ×20 | text on server 10s after close (no tab open): 11/20; new tab / other device: 20/20 |
| Cloud: type, close within 0.5s, ×20 (+20) | 40/40: on server within 10s, other device sees it |

**Cause: the save on tab close was dropped (hypothesis 1), and tab 2 has no
way to recover it (a variant of 2). Not the test's wait (3).**

- Guest notes get no keepalive request. Their only close-time network save is
  the normal server-action `fetch` from `handleForceSave`, which is cancelled
  with the page; under load it usually isn't sent at all (probe: no save fetch
  in 20/40 closes). Cloud notes' keepalive `leave-save` went out in 40/40.
- The offline-queue entry is (almost) never written on close: probe saw an
  `OfflineQueueDB` put in 4/40 guest closes. `enqueueContentNow` issues a
  `getAll` and does its `put` in `onsuccess`, which a dying page doesn't run.
  The IDB cache put (`saveNoteToLocal`) is issued, but its transaction was
  seen completing in only 8/40.
- Tab 2 had the note open read-only (waiting on `jn-note-edit:{id}`) and took
  the lock as tab 1 died. From then the note is "owned here": refreshes return
  the server copy (`protectUnsyncedLocal` skips `notToWrite`), the queue drain
  skips it, and `settlePendingEdits` only looks at the queue, not the cached
  `localEdit` copy. So tab 2 shows the empty note as **editable** for as long
  as it stays open (observed 50s+; focus refreshes do run, within ~30ms of the
  focus). Only a reload of tab 2 (startup reconcile) pushes the cached text.
- While that tab shows the empty note editable, typing in it would save over
  the closed tab's text on the same base version. Not yet reproduced.
- Separately: 2 runs lost the text outright (nothing in cache, queue or server;
  the close handler wrote nothing). Both were in specs that didn't check the
  editor held the text first, and a ProseMirror view was created ~25ms into
  typing — likely keystrokes lost to an editor remount, not the close path.
  Unconfirmed; with an editor check before close, 0/20 such losses.
