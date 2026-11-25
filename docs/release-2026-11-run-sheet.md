# Release run sheet: prelaunch/playwright-and-b7 → main (2026-11)

What ships: 40+ commits from `prelaunch/playwright-and-b7`. These include the
Upstash → self-hosted Valkey move (`4d81277`), the markdown round-trip fix
(`a3ccbac`), version trimming paused (`8f8b7cb`), the B7 / sync / sign-out work,
and the author-function hardening (`1f5f08b`, plus a migration).

**Rollback target: `61a5a01`** ("Presence: render avatars through shared Avatar
for one uniform fallback"). This is `origin/main` when this sheet was written.
Check in step a1 that production runs that commit. If it doesn't, use the commit
production actually runs everywhere this sheet says `61a5a01`.

Placeholders are in `<ANGLE_BRACKETS>`. Secrets are never typed on a command
line: each step reads them into a shell variable with `read -rs` and passes them
to the command through the environment.

> **Guest edits between the two copy passes (decided: option A).**
> `scripts/copy-to-valkey.mjs` merges guest notes (`notes:*` hash fields that
> exist on both sides) by `version`:
> - Upstash has the higher version → Upstash's copy replaces Valkey's. This is
>   a compare-and-set, so a write the app made in the meantime is never overwritten.
> - Valkey has the higher version → Valkey's copy stays.
> - Same version, different title or content → reported as a **conflict**. Nothing
>   is chosen, and Valkey's copy stays. The report shows the key and note id, never the content.
> - Same version, only metadata such as order differs → Valkey's copy stays, no conflict.
>
> The old build bumps `version` on every content, title and metadata edit, so an
> edit made on the old build between pass 1 and the deploy wins in pass 2.
> Reorders are the exception: `batchUpdateOrders` doesn't bump `version`. A
> reorder made in that gap is lost. Everything else stays Valkey-wins, as before.
>
> **Accepted:** deletions are not copied. A guest note deleted on the old build
> after pass 1 comes back after pass 2.
>
> Tested in `scripts/copy-to-valkey.test.mjs` (see a6).

---

## a. Pre-checks (all read-only)

### a1. Coolify auto-deploy, and what production runs now

In Coolify, open the JustNoted app.

- **Configuration → Advanced → "Auto Deploy"**
  - On: pushing `main` in step d **is** the deploy, so every env var in a3 must
    be saved before that push.
  - Off: after the push in step d, click **Deploy**.
- **Configuration → Source:** the branch must be `main`. A GitHub App, or a
  webhook under GitHub repo → Settings → Webhooks, must be connected.
- **Deployments:** the latest successful deployment's commit must be `61a5a01`.
- **Rollback tab:** note whether the image for `61a5a01` is listed. If it is,
  rollback g1 (redeploy the old image without a rebuild) is available.
- No Dockerfile or nixpacks.toml in the repo: Coolify builds with Nixpacks, so
  the whole repo, `scripts/` included, is in the image.

Locally:

```bash
git fetch origin
git rev-parse --short origin/main                                  # expect: 61a5a01
git rev-list --count origin/prelaunch/playwright-and-b7..origin/main  # expect: 0  (fast-forward possible)
```

### a2. Database migrations

`20260101000000_production_baseline.sql` is production's schema, dumped on
2026-11-11. The other renamed migrations were only made idempotent for a local
replay, and production already has their objects. Only two files postdate the
dump:

| Migration | Run in production? | When |
|---|---|---|
| `20261111000000_reconcile_to_production.sql` | **No.** It only removes objects that a local replay recreates; against production every statement is a no-op. | n/a |
| `20261111000001_harden_author_functions.sql` | **Yes** | **After the deploy (step d6).** The old build's profile page calls `create_author_with_random_username` from the browser, which this migration revokes. The new build calls it through a service-role server action. |

Check the current state in Studio → SQL Editor:

```sql
SELECT has_function_privilege('authenticated', 'public.author_id_by_email(text)', 'execute')                AS email_fn_open,
       has_function_privilege('authenticated', 'public.create_author_with_random_username(uuid)', 'execute') AS author_fn_open,
       (SELECT count(*) FROM public.authors WHERE username ~ '[[:space:]]')                                   AS broken_usernames;
```
Expected before: `email_fn_open = true`, `author_fn_open = true`, `broken_usernames` ≥ 0. Note the number.

No export can be in flight at deploy time. Old-build exports run as QStash jobs
against `/api/export/process`, and that route no longer exists on the new build:

```sql
SELECT status, count(*) FROM public.account_exports
WHERE status IN ('pending', 'processing') GROUP BY status;
```
Expected: 0 rows. If not, wait and re-check. On the new build, a stuck row older
than 30 minutes is marked `failed` and the user can retry.

### a3. Production env vars (Coolify → app → Environment Variables)

| Variable | Action | When | Notes |
|---|---|---|---|
| `VALKEY_URL` | **add** | before d | `redis://default:<VALKEY_PASSWORD>@<VALKEY_INTERNAL_HOST>:6379`. Runtime only, not a build variable: the client is lazy, so the build never connects. The old build ignores it. |
| `SOURCE_REDIS_URL` | **add, temporary** | before d | Upstash **TCP** endpoint, not the REST URL: Upstash console → database → Connect → ioredis → `rediss://default:<password>@<name>.upstash.io:6379`. Used only by copy pass 2. Remove in h1. |
| `VERSION_HISTORY_TRIM_ENABLED` | **leave unset** until h6 | h6 | Unset or anything other than `"true"` keeps version trimming paused, so damaged notes keep their restore candidates. Set to `true` only in h6, after f9. |
| `CLEANUP_API_KEY` | keep | n/a | Now used by the Coolify Scheduled Task (d5) instead of the QStash schedule. |
| `REDIS_CLEANUP_ENABLED` | **must not be `"true"`** until h | n/a | It turns on deletion of inactive guest notes in Valkey. Keep it off while data is being copied. |
| `NEXT_PUBLIC_PRIVATE_REALTIME` | **leave unset** | n/a | Blocked by `docs/tickets/private-realtime-presence-broadcast-read.md`. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | **remove, later** | h1 | The new build doesn't read them, but rolling back to `61a5a01` needs them. |
| `QSTASH_TOKEN`, `QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | **remove, later** | h1 | Same reason: the old build needs them for exports. Exports now use `after()`, and the weekly cleanup moves to a Coolify Scheduled Task (d5). |

No variable that QStash used gets a replacement. `LEGACY_VERSIONLESS_WRITES`,
the `NEXT_PUBLIC_*` variables, Supabase, R2, Stripe, Resend and Anthropic are
unchanged. Nothing at build time changes.

### a4. The app container can reach Valkey

In Coolify, open the **current (old) app container → Terminal**. The old image
has no ioredis, so this tests a plain TCP connection:

```bash
node -e "require('net').connect(6379,'<VALKEY_INTERNAL_HOST>').on('connect',()=>{console.log('reachable');process.exit(0)}).on('error',e=>{console.log(e.message);process.exit(1)})"
```
Expected: `reachable`. `ENOTFOUND` means the app and Valkey aren't on the same
Docker network. In Coolify, connect them (same project/environment, or
"Connect to Predefined Network") and re-check.

### a5. Valkey: noeviction, AOF, backup

On the Coolify host (SSH):

```bash
VK=<VALKEY_CONTAINER_NAME>        # docker ps --format '{{.Names}} {{.Image}}' | grep -i valkey
read -rs VALKEY_PASSWORD; export VALKEY_PASSWORD
vk() { docker exec -e REDISCLI_AUTH="$VALKEY_PASSWORD" "$VK" valkey-cli "$@"; }

vk CONFIG GET maxmemory-policy   # expect: maxmemory-policy / noeviction
vk CONFIG GET appendonly         # expect: appendonly / yes
vk CONFIG GET appendfsync        # expect: appendfsync / everysec   (or always)
vk CONFIG GET maxmemory          # expect: 0, or well above used_memory below
vk INFO persistence | grep -E 'aof_enabled|aof_last_write_status|aof_last_bgrewrite_status|rdb_last_bgsave_status'
#   expect: aof_enabled:1, aof_last_write_status:ok, aof_last_bgrewrite_status:ok, rdb_last_bgsave_status:ok
vk INFO memory | grep -E '^used_memory_human'
vk DBSIZE                        # other projects' keys may be here; justnoted:* should be 0 before c
vk --scan --pattern 'justnoted:*' --count 1000 | wc -l   # expect: 0
```

If a value is wrong, fix it in Coolify's **Valkey → Custom Configuration**
(`maxmemory-policy noeviction`, `appendonly yes`, `appendfsync everysec`), so it
survives a restart. `CONFIG SET` alone is lost on restart. Restart Valkey and
re-run the checks.

**Backup:** Valkey now holds primary data (guest notes). Check the resource for
a Backups tab. If Coolify offers no scheduled backup for it, add a host cron
job, then run it once by hand:

```bash
mkdir -p ~/valkey-backups && chmod 700 ~/valkey-backups
vk BGSAVE && sleep 5 && vk INFO persistence | grep rdb_last_bgsave_status   # expect: ok
docker cp "$VK":/data/dump.rdb ~/valkey-backups/valkey-$(date +%F-%H%M).rdb && ls -l ~/valkey-backups
# crontab -e (daily 03:15). The cron needs the password itself, e.g. from a root-only file:
# 15 3 * * * docker exec -e REDISCLI_AUTH="$(cat /root/.valkey_pw)" <VALKEY_CONTAINER_NAME> valkey-cli BGSAVE && sleep 30 && docker cp <VALKEY_CONTAINER_NAME>:/data/dump.rdb /root/valkey-backups/valkey-$(date +\%F).rdb
```
Copy the backups off this host as well. A backup on the same disk doesn't protect against losing the host.

### a6. Branch tip is green (locally)

```bash
git checkout prelaunch/playwright-and-b7 && git pull --ff-only
npx tsc --noEmit                  # expect: no output, exit 0
npx vitest run                    # expect: Test Files 41 passed; Tests 474 passed | 4 skipped
                                  #   (the 4 skipped are the copy-script integration tests below)
npx playwright test               # expect: all passed (fixme tests are skipped, not failed)
```

Copy-script integration test. It runs the real CLI against two throwaway local
Valkeys, flushes both, and refuses any URL that isn't localhost:

```bash
docker run -d --rm --name copytest-src -p 6392:6379 valkey/valkey:8
docker run -d --rm --name copytest-dst -p 6393:6379 valkey/valkey:8
COPY_TEST_SOURCE_URL=redis://127.0.0.1:6392 COPY_TEST_VALKEY_URL=redis://127.0.0.1:6393 \
  npx vitest run scripts/copy-to-valkey.test.mjs
#   expect: Test Files 1 passed; Tests 13 passed
docker stop copytest-src copytest-dst
```

---

## b. Upstash backup dump to a local file

Run locally on the branch, which has ioredis. The dump is read-only on Upstash.
The file holds guest notes and recovery-key hashes in plaintext: keep it outside
the repo, readable only by you, and don't delete it before h.

```bash
mkdir -p ~/justnoted-backups && chmod 700 ~/justnoted-backups
read -rs DUMP_REDIS_URL; export DUMP_REDIS_URL         # Upstash rediss:// TCP URL
node scripts/dump-redis.mjs ~/justnoted-backups/upstash-$(date +%F-%H%M).jsonl
```
Expected output:
```
{
  "dbsize": <N>,
  "scanned": <N>,
  "written": <W>,
  "strings": <S>,
  "hashes": <H>,
  "expired": <E>,
  "skippedType": {}
}
```
Checks:
- Exit 0.
- `written + expired + skipped ≈ dbsize`. Keys created during the dump can make it off by a few.
- `skippedType` is `{}`. Anything else is printed as `skipped (<type>): <key>`, and should be looked at before continuing.
- `ls -l` shows the file as `-rw-------`.
- `wc -l <file>` equals `written`.

Restore isn't automated: each line holds enough to rebuild its key with `SET`/`HSET` (+ `PEXPIRE` when `pttl > 0`).

Upstash counts each read as a command against your quota. The dump, two dry
runs and two applies read every key about 5 times. Check Upstash → Usage before starting.

---

## c. Copy pass 1: before the merge (dry run, then apply)

**Canary (for step f):** in a private window on production, signed out, create a
guest note with the text `canary-1`. After c4, edit it to `canary-2` (still on
the old build).

The old app image has neither the script nor ioredis, so pass 1 runs on the
Coolify host in a throwaway Node container on Valkey's network:

```bash
# local:
scp scripts/copy-to-valkey.mjs <SERVER>:~/valkey-copy/

# on the host:
cd ~/valkey-copy
NET=$(docker inspect "$VK" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' | head -1); echo "$NET"
read -rs SOURCE_REDIS_URL; export SOURCE_REDIS_URL     # Upstash rediss:// TCP URL
read -rs VALKEY_URL;       export VALKEY_URL           # same value as the app's VALKEY_URL
copy() { docker run --rm --network "$NET" -v "$PWD":/w -w /w -e SOURCE_REDIS_URL -e VALKEY_URL \
  node:22-alpine sh -c 'npm i --no-save --silent ioredis@5.11.1 >/dev/null && node copy-to-valkey.mjs "$@"' _ "$@"; }
```

**c1. Dry run:**
```bash
copy; echo "exit $?"
```
Expected:
```
DRY RUN (no writes) -> prefix "justnoted:"
{ "scanned": <≈ dbsize from b>, "byType": {"string": …, "hash": …},
  "strings": {"copied": <≈ all strings>, "skippedExisting": 0, "skippedSupersededRecovery": 0},
  "hashes": {"created": <≈ all hashes>, "merged": 0, "unchanged": 0, "fieldsAdded": …,
             "fieldsReplacedWithNewer": 0, "fieldsKeptFromValkey": 0, "fieldConflicts": 0},
  "legacyArraysMergedIntoHash": 0, "revisionsBumped": 0, "expired": …,
  "skippedType": {}, "conflicts": 0, "mismatches": 0 }
(counts are what --apply would do)
exit 0
```
Valkey holds no `justnoted:` keys yet, so anything "existing"/"merged" here means something wrote to it already. Stop and investigate.

**c2. Apply:**
```bash
copy --apply; echo "exit $?"
```
Expected: `APPLYING -> prefix "justnoted:"`, the same counts as c1, `conflicts: 0`, `mismatches: 0`, `exit 0`. Exit `2` here means conflicts or mismatches, listed on stderr. Valkey was empty, so neither should happen. Stop.

**c3. Verify:**
```bash
vk --scan --pattern 'justnoted:*' --count 1000 | wc -l    # expect: ≈ strings.copied + hashes.created
```

**c4.** Go straight to d. (Edit the canary to `canary-2` now.)

---

## d. Deploy

**d1.** Confirm that a3 (`VALKEY_URL`, `SOURCE_REDIS_URL`) is saved in Coolify.

**d2. Fast-forward main locally:**
```bash
git fetch origin
git checkout main
git merge --ff-only origin/main
#   expect: Already up to date.
git merge --ff-only origin/prelaunch/playwright-and-b7
#   expect: Updating 61a5a01..<TIP>  Fast-forward  …
git log -1 --oneline        # expect: <TIP>, the branch tip
```
If the second merge says `Not possible to fast-forward`, main has moved. Stop and redo a1.

**d3. Push:**
```bash
git push origin main
#   expect: 61a5a01..<TIP>  main -> main
```
If auto-deploy is off: Coolify → Deploy.

**d4. Watch the deployment** (Coolify → Deployments → logs). Expected:
- `npm ci`, then `next build` finishes with no type errors.
- The container is healthy.
- `curl -fsS https://<APP_DOMAIN>/api/health` returns 200.
- The app log has no `[redis]` connection errors.

**d5. Replace the QStash schedule:**
1. Coolify → app → **Scheduled Tasks → Add**.
   - Name: `weekly-cleanup`
   - Frequency: `0 2 * * 1`
   - Container: the app
   - Command: `curl -fsS -X POST -H "x-api-key: $CLEANUP_API_KEY" http://localhost:3000/api/admin/cleanup`
2. Click **Run now** once. The output should be `{"success":true,"redis":{"success":true,"skipped":true},…}`. Redis is skipped because `REDIS_CLEANUP_ENABLED` is off.
3. Upstash console → QStash → Schedules → **pause** the schedule that targets `/api/admin/cleanup`. Pause, don't delete: a rollback re-enables it.

**d6. Run the author-function migration.** Paste the whole of
`supabase/migrations/20261111000001_harden_author_functions.sql` into Studio → SQL Editor and run it. Then:

```sql
SELECT has_function_privilege('authenticated', 'public.author_id_by_email(text)', 'execute')                AS email_fn_open,
       has_function_privilege('authenticated', 'public.create_author_with_random_username(uuid)', 'execute') AS author_fn_open,
       (SELECT count(*) FROM public.authors WHERE username ~ '[[:space:]]')                                   AS broken_usernames;
```
Expected: `false | false | 0`.

---

## e. Copy pass 2: straight after the deploy (dry run, then apply)

Run in the **new** app container (Coolify → app → Terminal), which already has
`VALKEY_URL`, `SOURCE_REDIS_URL`, the script and ioredis:

**e0. Final Upstash dump.** Run the step b command locally, with a new filename.
Upstash is no longer written to, so this file holds the old build's last copy of
every guest note. Any conflict in e2 is resolved from it.

```bash
node scripts/copy-to-valkey.mjs; echo "exit $?"            # e1 dry run
```
Expected:
- `strings.copied` and `hashes.created` / `hashes.merged` are small: only what the old build wrote between c2 and d4.
- `fieldsReplacedWithNewer` is the number of guest notes edited on the old build after pass 1. The canary counts as 1.
- `fieldsKeptFromValkey` is large: everything pass 1 already copied.
- `fieldConflicts: 0`, `mismatches: 0`, `exit 0`.

```bash
node scripts/copy-to-valkey.mjs --apply; echo "exit $?"    # e2 apply
```
Expected: matches e1, `exit 0`. `revisionsBumped` counts the existing guest
hashes that gained or replaced notes, so open guest tabs refresh.

**If e1/e2 exit `2`:** read the stderr lines.
- `mismatch: …` → stop and investigate before continuing.
- `conflict: notes:<id> note <noteId> (same version N, different title/content; Valkey's copy kept)` →
  that note was edited on both builds from the same version. Valkey's copy
  (the new build's) stays live. The old build's text is in the e0 dump: the
  line with `"key":"notes:<id>"`, field `<noteId>`, base64-decoded. Record each
  pair and carry on. Merging them by hand is a follow-up, not a blocker.
- `conflict: … (changed in Valkey during the merge …)` → re-run e2. The app
  wrote to that note while the copy ran.

**e3.** Re-run the dry run. Expected: `strings.copied: 0`, `hashes.created: 0`,
`hashes.merged: 0`, `fieldsReplacedWithNewer: 0`, so nothing is left to copy.
Any conflicts from e2 are listed again; that's expected. Upstash receives no new
writes from now on (only a rollback would write to it).

---

## f. Smoke test on production

Use a normal window signed in to a test account, and a private window for guest tests.

| # | Test | Expected |
|---|---|---|
| f1 | Create a note, type a paragraph, wait for "Saved", reload | Text is unchanged after the reload. No "(conflicted copy)" note appears. |
| f2 | Open the same note in two tabs. Type in tab 1, then in tab 2. | Each tab shows the other's text within a few seconds. Both say "Saved". No conflicted copy. |
| f3 | Type a mixed list: `- one`, `- [ ] task`, `- two`, plus a line with a literal `\*not italic\*`. Reload 3 times, making a small edit in another paragraph each time. | List shape unchanged: bullets stay bullets, the task keeps its checkbox, no empty bullet with a nested list, the literal asterisks stay literal. |
| f4 | DevTools → Network → Offline. Type in a note. Click **Sign out**. | "Syncing 1 note before signing out…", then "Sign out anyway — 1 unsaved notes will be lost". Click **Cancel**. Go back online, sign out: it syncs, then signs out. Sign back in: the edit is there. |
| f5 | Private window, signed out: create a guest note, type, reload | Note and text persist. On the host, `vk --scan --pattern 'justnoted:notes:*' \| wc -l` is ≥ 1. |
| f6 | Private window from step c (the canary) | Shows `canary-2` (the old build's edit after pass 1, taken in e2 because its version is higher). `canary-1` means the version-aware merge didn't apply. Check e2's `fieldsReplacedWithNewer`. |
| f7 | Profile page, share-by-email to a second test account | The recipient opens the note (exercises the hardened functions). |
| f8 | Settings → export account | The export reaches "ready" (it now runs in-process with `after()`). |

### f9. Restore the two damaged notes through Version history

Do this on the new build only: it no longer strips escapes, and version
trimming is paused there. Signed in as the notes' owner, in a browser set to
Brisbane time. Version history shows dates in the browser's time zone, as
"15 Oct, 10:09 am".

| Note | Restore the version from |
|---|---|
| `d93eeeae-2555-4a04-b787-1a2015133679` | 15 Oct 2026, 10:09 am (Brisbane) |
| `23f00a61-2506-41cc-a3e1-35f282446425` | 12 Jun 2026, 8:36 am (Brisbane) |

**f9.1 Check that each version appears in the panel.** The panel lists only a
note's newest 50 versions (Draft) or 200 (Scribe). Trimming has been paused, so
a note can have more. In Studio → SQL Editor (IDs and timestamps only):

```sql
SELECT note_id, id AS version_id,
       created_at AT TIME ZONE 'Australia/Brisbane' AS brisbane_time, pos_from_newest
FROM (
  SELECT v.note_id, v.id, v.created_at,
         row_number() OVER (PARTITION BY v.note_id ORDER BY v.created_at DESC) AS pos_from_newest
  FROM public.note_versions v
  JOIN public.notes n ON n.id = v.note_id AND v.author = n.author
  WHERE v.note_id IN ('d93eeeae-2555-4a04-b787-1a2015133679', '23f00a61-2506-41cc-a3e1-35f282446425')
) x
WHERE (note_id = 'd93eeeae-2555-4a04-b787-1a2015133679'
       AND created_at AT TIME ZONE 'Australia/Brisbane' >= '2026-10-15 10:09' AND created_at AT TIME ZONE 'Australia/Brisbane' < '2026-10-15 10:10')
   OR (note_id = '23f00a61-2506-41cc-a3e1-35f282446425'
       AND created_at AT TIME ZONE 'Australia/Brisbane' >= '2026-06-12 08:36' AND created_at AT TIME ZONE 'Australia/Brisbane' < '2026-06-12 08:37')
ORDER BY note_id, created_at;
```
Expected:
- One row per note. If it's the same version Q1 listed as `restore_version_id`, that's a good sign.
- `pos_from_newest` is at most your plan's cap (50 or 200), so the version is in the panel.
- If it's over the cap and you're on Scribe, use the panel's date-range filter to bring it up.
- If you're on Draft, stop. That version can't be reached from the panel, and needs a different restore path.
- More than one row in that minute: note each `version_id`'s time to the second, and preview each in f9.3.

**f9.2 Save the current text to a scratch note first.**
1. Open the damaged note.
2. Select all of the body and copy it.
3. Create a new note titled `scratch: <original title>` and paste.
4. Wait for "Saved", then reload the scratch note and check the text is all there.

This is what you merge back from. The newest entries in the note's Version
history are a second copy.

**f9.3 Restore.**
1. Back in the damaged note, open ⋯ → **Version history**.
2. Find the version by its time and click it to preview. The preview shows raw
   markdown: escaped characters show as `\*`, `\-` and so on, and lists have no
   empty bullet holding a nested list.
3. Click **Restore** and confirm.

Restore replaces both the title and the body, and saves like a normal edit.

**f9.4 Merge back anything newer.**
1. Compare the scratch note with the restored note.
2. Anything written after the restored version's date exists only in the
   scratch note. Copy it across into the restored note, fixing any list the
   damage had flattened or nested.
3. Wait for "Saved".
4. Reload 3 times, making a small edit each time. The text and lists must stay
   exactly as you left them; this is the round-trip fix working on real data.

**f9.5** Keep the scratch notes until h6, then delete them (to trash). Repeat
f9.2–f9.5 for the second note.

---

## g. Rollback

### g1. Fastest: redeploy the old image

Coolify → app → **Rollback** → choose the `61a5a01` image. This works only if a1
showed that image is still kept. It skips the build.

### g2. From git (this also keeps `main` honest)

This adds one commit whose tree is exactly `61a5a01`'s, with no force-push:

```bash
git fetch origin && git checkout main && git merge --ff-only origin/main
C=$(git commit-tree '61a5a01^{tree}' -p HEAD -m "Roll back production to 61a5a01")
git merge --ff-only "$C"
git diff --stat 61a5a01 HEAD          # expect: no output (identical tree)
git push origin main                  # auto-deploy rebuilds 61a5a01's code; else Coolify → Deploy
```
If you used g1, still do g2. Otherwise the next push to main would redeploy the new code by accident.

### g3. After rolling back
- Upstash QStash: **resume** the cleanup schedule.
- Coolify: disable the `weekly-cleanup` task.
- Keep `UPSTASH_*` and `QSTASH_*`. They are still set, because h hasn't run.
- If d6 ran, re-open the one function the old build calls from the browser:
  ```sql
  GRANT EXECUTE ON FUNCTION public.create_author_with_random_username(uuid) TO authenticated;
  ```
  `author_id_by_email` stays service-role only: the old build calls it with the
  service role too. The username repair stays. It's harmless to the old build.

### g4. What happens to data written in between
- **Cloud notes, versions, shares, settings (Supabase):** these stay and the old
  build reads them. The schema didn't change, apart from d6's grants. The old build
  **resumes version trimming**, so restore candidates for damaged notes start being
  trimmed again.
- **Guest notes and recovery keys (Valkey):** anything created or edited on the
  new build exists only in Valkey. The old build reads Upstash, so guests see
  their pre-deploy server copies. Whether their browser cache pushes the newer
  text back up has not been verified. Nothing is deleted: Valkey keeps it for a re-release.
- **Re-releasing later:** run c and e again. Guest edits made on the old build
  during the rollback have higher versions, so they win. A note edited on both
  builds from the same version is reported as a conflict. Guest notes deleted
  during the rollback come back.
- **Open tabs** still running the new JS get server-action errors until they reload.
- **Exports** started on the new build and still running at rollback are marked
  failed after 30 minutes. Users retry.

---

## h. Afterwards (once the rollback window has closed: 3 days stable)

**h1. Coolify env:**
- Remove `SOURCE_REDIS_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `QSTASH_TOKEN`, `QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY`.
- Redeploy (env changes need a restart).
- Check that `curl -fsS https://<APP_DOMAIN>/api/health` returns 200.

**h2. Upstash:**
1. Take a final dump (step b command, new filename).
2. In the console, delete the QStash schedule, then the Redis database, then QStash.
3. Keep the dump files somewhere safe and private, then delete them when no longer needed.

**h3. Follow-up commit:** remove every Upstash reference from the repo.
```bash
git grep -n -i -l -e upstash -e qstash -e SOURCE_REDIS_URL
#   expect exactly these files:
#   docs/release-2026-11-run-sheet.md                      (this sheet)
#   scripts/copy-to-valkey.mjs                             (SOURCE_REDIS_URL)
#   scripts/copy-to-valkey.test.mjs                        (SOURCE_REDIS_URL)
#   supabase/migrations/20261001000001_account_exports.sql (line 1 comment: "enqueues a QStash job")
```
- Reword the migration comment to describe the current behaviour ("runs the export in-process with `after()`").
- Delete `scripts/copy-to-valkey.mjs` and `scripts/copy-to-valkey.test.mjs`: one-off, and their only source was Upstash.
- Delete this run sheet. Git history keeps it; `git show <this commit>:docs/release-2026-11-run-sheet.md`.
- Keep `scripts/dump-redis.mjs`: it's generic (`DUMP_REDIS_URL`), and works for Valkey backups too.
- Locally, delete the `UPSTASH_*` / `QSTASH_*` lines from `.env.local` and `.env.e2e`. Both are untracked.

```bash
git rm scripts/copy-to-valkey.mjs scripts/copy-to-valkey.test.mjs docs/release-2026-11-run-sheet.md
# edit the migration comment
git grep -n -i -e upstash -e qstash -e SOURCE_REDIS_URL   # expect: no output
npx vitest run                                            # expect: all passed
git commit -am "Remove the last Upstash/QStash references and the one-off Valkey copy script"
git push origin main
```

**h4.** Set `REDIS_CLEANUP_ENABLED=true` if guest-note cleanup should run again.

**h5.** Other users' damaged notes: the Q2 counts from the damage assessment
are still open. Decide what to do about them before h6. Once trimming
resumes, their restore candidates start being deleted.

**h6. Last step: resume version trimming.** Do this only after f9 is complete
for both notes and h5 is decided.
1. Coolify → app → Environment Variables → set `VERSION_HISTORY_TRIM_ENABLED=true` (runtime, not a build variable).
2. Redeploy.
3. Health check: `curl -fsS https://<APP_DOMAIN>/api/health` → 200.
4. Edit any note for at least 5 minutes so an autosave snapshot is taken.
   Expected: no errors in the app log.

Trimming happens gradually: each new autosave on a note over its plan's cap
deletes that note's oldest autosaves, until it's back at the cap. Nothing is
deleted all at once.

Then delete the f9 scratch notes.
