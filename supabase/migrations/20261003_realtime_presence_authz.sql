-- Realtime authorization — PRESENCE ONLY (step 1 of the private-channel rollout).
--
-- Proves private-channel authorization works on our self-hosted Realtime
-- (v2.76.5) before we flip yjs/presence everywhere. RLS on realtime.messages is
-- consulted ONLY for channels joined with `private: true`, so applying this is
-- inert until the client opts a channel into private mode.
--
-- Scope here: the `presence:<noteId>` channel. yjs (two-topic) + its edit helper
-- land in a follow-up migration once this is verified.

-- Who may RECEIVE a note's live stream: the owner, a reader, or a public link —
-- and only while the note is NOT trashed (A4). security definer so it can read
-- notes/shared_notes* regardless of the (authenticated) caller's own RLS.
create or replace function public.can_access_note_live(p_note_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_note_id is not null
     and exists (select 1 from public.notes n where n.id = p_note_id and n.deleted_at is null)
     and (
          exists (select 1 from public.notes n
                   where n.id = p_note_id and n.author = (select auth.uid()))
       or exists (select 1 from public.shared_notes sn
                    join public.shared_notes_readers r on r.shared_note = sn.id
                   where sn.note_id = p_note_id and r.reader_id = (select auth.uid())::text)
       or exists (select 1 from public.shared_notes sn
                   where sn.note_id = p_note_id and sn.is_public = true)
     );
$$;

revoke execute on function public.can_access_note_live(uuid) from public, anon;
grant  execute on function public.can_access_note_live(uuid) to authenticated;

-- Safe topic -> note id: only an exact "<prefix>:<uuid>" topic yields a uuid;
-- anything else (junk topic, wrong prefix) returns NULL, which denies rather
-- than erroring the policy. "presence" does not match "presenceX:" (colon-anchored).
create or replace function public.realtime_note_id(p_prefix text)
returns uuid
language sql
stable
set search_path = public, realtime
as $$
  select case
    when realtime.topic() ~ ('^' || p_prefix ||
         ':[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    then substring(realtime.topic() from length(p_prefix) + 2)::uuid
    else null
  end;
$$;

grant execute on function public.realtime_note_id(text) to authenticated;

alter table realtime.messages enable row level security;

-- presence:<noteId> — any current participant may send AND receive; restricted
-- to the presence extension so it can't be used to smuggle broadcast traffic.
drop policy if exists "presence_receive" on realtime.messages;
create policy "presence_receive" on realtime.messages
  for select to authenticated
  using ( extension = 'presence'
          and public.can_access_note_live(public.realtime_note_id('presence')) );

drop policy if exists "presence_send" on realtime.messages;
create policy "presence_send" on realtime.messages
  for insert to authenticated
  with check ( extension = 'presence'
               and public.can_access_note_live(public.realtime_note_id('presence')) );
