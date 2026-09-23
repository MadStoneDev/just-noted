# Collaboration — test checklist

Things to verify on the live site once you're back to testing collab. All the
sync work is deployed; the `note_ydoc` migration is applied.

## Setup
- Two browsers / profiles, each signed into a **different** account (A and B).
- The note's owner (A) must be on **Scribe** to enable "Can edit" (collaboration
  is Scribe-gated). To grant yourself Scribe for testing:
  ```sql
  insert into subscriptions (user_id, tier, status)
  values ('<user-id>', 'scribe', 'active')
  on conflict (user_id) do update set tier='scribe', status='active';
  ```
- Share the note with **Can edit** (link-level) or add B as a **Can edit** person.

## Live editing
- [ ] A and B both type → text **merges**, no repeated/duplicated content.
- [ ] Each sees the other's **caret** in their colour + name flag (fades after ~2s).
- [ ] Presence avatars show both people in the banner.
- [ ] No "gap" appears at newlines while the other's caret sits there.

## The bugs we just fixed — confirm they're gone
- [ ] **Duplication:** close both, reopen the note → content is intact and
      **singular** (not the whole note repeated).
- [ ] **Stale-tab clobber:** background B for a while, edit on A, then revive B
      (focus its tab) → B **catches up** to A's changes; A's edits are **not** lost.
- [ ] Open the same note in 3+ tabs, edit around → still converges, no dupes.

## Known residual (tell me if you hit it)
- If two people open a **never-before-collaborated** note within ~1s of each
  other (no persisted doc yet), a one-time double-seed could still duplicate.
  In practice the owner seeds first when enabling Can-edit. If this bites, ask
  for the "insert-if-absent" atomic first-seed claim.

## Version history (banner "History")
- [ ] Opening History lists saved versions with author + time.
- [ ] "Copy version" copies that version's content.

## Billing (once Stripe is configured)
- [ ] Settings › Plan & usage shows Draft/Scribe + usage meters.
- [ ] "Upgrade to Scribe" opens the Stripe Payment Link.
- [ ] After paying, the webhook flips you to Scribe; "Manage" opens the portal.
