# Shared-note overwrite in E2E (2026-11-27)

**Verdict: an app bug, pre-existing (on 6873877 too), not cross-account.**
The writer is always account A's own browser, in A's own note. But the
loss reaches every collaborator: their view of the shared note loses the body,
and in one variant the stored Yjs doc they all load is replaced.
No app code was changed for this investigation.

## What was seen

In one Stage 1 full run, the seeded note (owned by A, shared with B as an
editor) ended as title `E2E shared note`, body `" e2e-b7-<ts>"` only. The
original body, "Shared with B for collaboration specs.", was gone. Three specs
that read that body then failed.

The extra "E" in the reported text `EE2E shared note` is **not** a title change.
It is the viewer's presence avatar initial: `PresenceStack` renders
`<Avatar name="e2eB…">`, which prints "E" just before the title. The title was
never written (`finalTitle` in every diag line equals the title it was created with).

## 1. Full suite, 3 runs per commit

A watcher (`e2e/diag-watch-seeded-note.cjs`) logged every change to the seeded note
during each run. `attribute.py` matches each change to the tests that were running
at that moment, using the JSON reporter.

| Commit | Body lost | Run failures |
|---|---|---|
| 6873877 (before Stage 1) | 0 / 3 | only sign-out (b), which is an expected `test.fail` |
| 527f9c7 (Stage 1) | 2 / 3 (and 1 of 1 in the first session: 3 / 4) | on runs that lost the body: the 3 specs that read it. Once: the roadmap phone 1 px scroll flake, which is unrelated |

Every overwrite happened while `core-flows.spec.ts:488` ("offline: switching is
refused…", signed in as A) was running. The other worker was running a guest
(anonymous) `delete-ghost` test each time. It was the only content write to the
note in the run, version 1 → 2. Details are in `full-runs/attribution.txt`, and
the per-change logs are in `full-runs/*.watch.jsonl`.

The 0/3 vs 2/3 split is **not** evidence that Stage 1 caused this. The race
exists on both builds (section 3), and its margin is about 200 ms, so small
timing changes move the rate. With n=3 the difference is well within chance.

## 2. The write path

- **Test:** B7 offline, `core-flows.spec.ts:488`.
- **Browser context:** that test's `page`, signed in as **A**, with B only on the device list.
- **Note:** A's own note.
- **Code path:** the **offline-queue replay** of a content save flagged
  `projection: true`. It is not leave-save, broadcast hand-off or account-switch
  restore. The queued save was already wrong when it was queued: the editor was
  empty when the test typed.

Mechanism, from the code and confirmed by the timelines in `collab-seed/*`:

1. The owner opens the note, and the plain editor shows "Shared with B…".
2. A sharing probe (`sharingOperation getUsers`, then an `authors` select) runs
   **after** the note is on screen (`active-note-editor.tsx` ~L511–549). B has
   edit access, so it calls `setCollabConfig`. The editor key changes, and the
   editor **remounts in Yjs mode with an empty doc** (`milkdown-editor.tsx` L374
   `defaultValueCtx = ""`).
3. The collab bind loads `/api/collab`. With no stored doc, it waits **1 s**
   (`seedTimer`) and fills from `note.content` only if the doc is **still blank**
   (L569–589).
4. Text typed during those ~1.1 s goes into the empty doc, so the doc is no longer
   blank and the fill is skipped. The doc, and the content projection of it, now
   hold only the typed text.
5. The save sends that text, and the server accepts it:
   - The blank-guard (`wouldBlankNonEmpty`) only stops a fully empty save.
   - With a stored doc, the projection skips CAS. Without one, CAS against the
     client's base version succeeds because nobody else wrote.
   - The body is gone.
6. Offline, as in B7, the save queues and replays on reconnect.

The B7 test types about 1.57 s after the note opens. Collab mode starts 160–525 ms
after opening, so the test is safe only while `getUsers` answers within about
400 ms. On a loaded machine it sometimes doesn't.

## 3. Deterministic reproduction (`e2e/diag-collab-seed-overwrite.spec.ts`)

Each iteration uses a fresh note owned by A, shared with B (edit) exactly like
the seed, so iterations can't interfere. 2 workers, 6 iterations per variant:

| Variant | 6873877 | 527f9c7 |
|---|---|---|
| `b7-as-is`: B7 steps unchanged | 1 / 6 lost | 1 / 6 lost |
| `b7-busy-server`: B7 steps, `getUsers` answered in 1 s instead of ~0.12 s | 6 / 6 | 6 / 6 |
| `online-grace`: online, type the moment collab mode starts | 6 / 6 | 6 / 6 |
| `load-fails`: the note already has a stored doc; the next open's `/api/collab` fails, then typing | 6 / 6, **stored doc replaced** | 6 / 6, **stored doc replaced** |
| `control`: not shared (plain editor), B7 steps | 0 / 6 | 0 / 6 |

- In every lost iteration the editor text at "typing" was `"\n"` (empty). In
  every kept one it was the body.
- Lost content is always exactly `" <marker>\n"`, the same shape as the original
  `" e2e-b7-…"`.
- `note_versions` keeps a snapshot of the marker-only text, so the body is not
  recoverable from history.

`load-fails` is the worst case. `fetchCollabState` returns `null` both for "no
doc" and for "request failed". So a client whose load fails starts from an empty
doc, then skips the fill (the user typed). `saveCollabState` then **upserts the
full state, replacing** the stored doc with the typed text. Every collaborator who
opens it next gets the body-less doc. In production, a flaky connection or a 5xx
on `/api/collab` while the owner types right after opening is enough.

Not tested: the recipient's side (B opening `/n/<code>`) uses the same editor
collab bind and very likely has the same window.

Timelines for every iteration: `collab-seed/<commit>/<variant>.jsonl`.

## 4. Proposed fix (not applied; for approval)

The client changes and the server merge are independent. Each closes part of the
window, and the server merge is the safety net.

1. **No input before the doc is ready** (`milkdown-editor.tsx`, collab bind).
   - Keep the view non-editable from bind until one of: the stored state is
     applied, the fill has run, or the doc is confirmed empty with no content to fill.
   - Keep showing the plain editor's text meanwhile, rather than an empty doc, so
     the note doesn't blank for ~1 s on every open. That blank is a visible bug in itself.
2. **Tell "no doc" apart from "load failed".**
   - `fetchCollabState` throws or returns an error on failure; `null` means only "no stored doc".
   - On failure, don't enter collab mode: stay in the plain, CAS-protected editor
     and retry the probe. Never persist a doc that started from a failed load.
3. **Server: merge, don't replace.** In `saveCollabState`, combine the stored
   state with the incoming one (`Y.mergeUpdates([stored, incoming])`) instead of
   upserting the incoming state alone. A client that started from an empty doc
   then adds its text instead of wiping the shared doc. The worst case becomes a
   duplicated fragment, not a loss.
4. **Fill without the grace delay when it's safe.** With no stored doc and no
   peers present, the elected seeder can fill immediately. The 1 s grace only
   matters when another participant is in the room.
5. **Tests.**
   - The B7 offline test should also assert the original body survives (today it
     checks only the marker, which is why it "passed" while destroying the body),
     and use its own shared note instead of the seeded one, so it can't break the
     three specs that read that body.
   - Promote `online-grace` and `load-fails` to regular regression specs that
     expect the body kept.

## Files

- `e2e/diag-collab-seed-overwrite.spec.ts`: the reproduction (`E2E_DIAG=1`, skipped otherwise).
- `e2e/diag-watch-seeded-note.cjs`: the full-run watcher.
- `attribute.py`: matches watcher changes to running tests (`python3 attribute.py <dir with *-runN.json + .watch.jsonl>`).
- `full-runs/`: per-run results, watcher logs, attribution.
- `collab-seed/<commit>/`: the diag's JSON lines.
