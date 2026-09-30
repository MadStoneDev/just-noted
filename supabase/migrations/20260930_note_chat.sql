-- Collaboration chat (P1a): per-shared-note messages, edit history + read state.
--
-- Participants of a note = its owner (notes.author) plus everyone it's shared
-- with (shared_notes_readers). RLS scopes reads to participants so the Realtime
-- subscription is safe; all writes go through service-role server actions
-- (chatActions), which additionally enforce the owner's Scribe plan. There is
-- deliberately no client INSERT/UPDATE/DELETE policy on messages.

CREATE TABLE IF NOT EXISTS public.note_chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id     UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  -- FK to the auth user, ON DELETE SET NULL so a message survives its author's
  -- account deletion as "Deleted user" (the account-delete flow also purges
  -- their uploaded media).
  author_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL DEFAULT 'text'
                CHECK (kind IN ('text', 'image', 'gif', 'audio', 'system')),
  body        TEXT CHECK (body IS NULL OR char_length(body) <= 4000),
  reply_to    UUID REFERENCES public.note_chat_messages(id) ON DELETE SET NULL,
  anchor      JSONB,               -- Yjs relative-position highlight + quote fallback (P3)
  media_key   TEXT,                -- private R2 object key (P2)
  media_mime  TEXT,
  media_meta  JSONB,               -- { width, height, durationMs, size } (P2)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at   TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ          -- soft delete → "Message deleted" tombstone
);

CREATE INDEX IF NOT EXISTS note_chat_messages_note_id_created_idx
  ON public.note_chat_messages (note_id, created_at);

-- Keep the default replica identity: Realtime UPDATE payloads then carry only
-- the primary key as `old` (never the pre-edit / pre-delete body), so clearing
-- a message's content on delete can't be reconstructed from the broadcast.
ALTER TABLE public.note_chat_messages REPLICA IDENTITY DEFAULT;

-- Edit history: the previous body is saved here before an edit. Purged with the
-- message (cascade on hard delete; the delete-own action clears it on soft
-- delete so a deleted message leaves no recoverable content).
CREATE TABLE IF NOT EXISTS public.note_chat_message_versions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.note_chat_messages(id) ON DELETE CASCADE,
  body       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS note_chat_message_versions_message_idx
  ON public.note_chat_message_versions (message_id, created_at);

CREATE TABLE IF NOT EXISTS public.note_chat_reads (
  note_id      UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, user_id)
);

-- Who may see a note's chat: the owner, or anyone it's shared with. Uses the
-- CALLER's identity ((select auth.uid())) — it can't be pointed at another user
-- to probe their participation. SECURITY DEFINER so the policy can read
-- shared_notes/notes regardless of their own RLS.
CREATE OR REPLACE FUNCTION public.is_note_chat_participant(p_note_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.notes n
    WHERE n.id = p_note_id AND n.author = (select auth.uid())
  ) OR EXISTS (
    SELECT 1
    FROM public.shared_notes sn
    JOIN public.shared_notes_readers r ON r.shared_note = sn.id
    -- shared_notes_readers.reader_id is TEXT (not uuid), so compare as text.
    WHERE sn.note_id = p_note_id AND r.reader_id = (select auth.uid())::text
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_note_chat_participant(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_note_chat_participant(UUID) TO authenticated;

-- A reply must point at a message in the SAME note.
CREATE OR REPLACE FUNCTION public.note_chat_reply_same_note()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reply_to IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.note_chat_messages p
       WHERE p.id = NEW.reply_to AND p.note_id = NEW.note_id
     ) THEN
    RAISE EXCEPTION 'reply_to must reference a message in the same note';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS note_chat_reply_same_note_trg ON public.note_chat_messages;
CREATE TRIGGER note_chat_reply_same_note_trg
  BEFORE INSERT OR UPDATE ON public.note_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.note_chat_reply_same_note();

ALTER TABLE public.note_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_chat_message_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_chat_reads ENABLE ROW LEVEL SECURITY;

-- Messages: participants may READ (drives the Realtime subscription + initial
-- load). No client write policy — writes are service-role via chatActions.
DROP POLICY IF EXISTS note_chat_messages_select ON public.note_chat_messages;
CREATE POLICY note_chat_messages_select ON public.note_chat_messages
  FOR SELECT USING (public.is_note_chat_participant(note_id));

-- Edit history: readable by participants of the parent message's note. No
-- client writes.
DROP POLICY IF EXISTS note_chat_message_versions_select ON public.note_chat_message_versions;
CREATE POLICY note_chat_message_versions_select ON public.note_chat_message_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.note_chat_messages m
      WHERE m.id = message_id AND public.is_note_chat_participant(m.note_id)
    )
  );

-- Read state: a user only ever sees/sets their OWN row, and only for a note
-- they participate in.
DROP POLICY IF EXISTS note_chat_reads_select ON public.note_chat_reads;
CREATE POLICY note_chat_reads_select ON public.note_chat_reads
  FOR SELECT USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS note_chat_reads_upsert ON public.note_chat_reads;
CREATE POLICY note_chat_reads_upsert ON public.note_chat_reads
  FOR INSERT WITH CHECK (
    user_id = (select auth.uid()) AND public.is_note_chat_participant(note_id)
  );
DROP POLICY IF EXISTS note_chat_reads_update ON public.note_chat_reads;
CREATE POLICY note_chat_reads_update ON public.note_chat_reads
  FOR UPDATE USING (user_id = (select auth.uid()))
  WITH CHECK (
    user_id = (select auth.uid()) AND public.is_note_chat_participant(note_id)
  );

-- Deliver row changes to subscribed participants (RLS still applies per token).
-- Not idempotent on re-run; guarded so re-applying the migration can't fail.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.note_chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
