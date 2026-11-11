-- In-app notifications + a per-user settings store (notification prefs + editor
-- prefs). Notifications are created server-side (service role); a user may read,
-- mark read, and delete their own. Realtime delivers new ones to the bell.
--
-- NOTE: user_settings is directly writable by the user, so it holds only
-- non-privileged preferences (notification frequencies + editor prefs). Any
-- plan-gated value (Scribe trash retention, version-history range filter, etc.)
-- is NEVER read from here — it's enforced server-side against the plan.

CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- recipient
  type       TEXT NOT NULL,                                              -- registry key
  actor_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,          -- who triggered it
  note_id    UUID REFERENCES public.notes(id) ON DELETE CASCADE,         -- related note
  data       JSONB,                                                      -- display context
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_note_type_idx
  ON public.notifications (user_id, note_id, type) WHERE read_at IS NULL;

-- Realtime UPDATE payloads carry only the primary key as `old` (no content leak).
ALTER TABLE public.notifications REPLICA IDENTITY DEFAULT;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
DROP POLICY IF EXISTS notifications_delete ON public.notifications;
CREATE POLICY notifications_delete ON public.notifications
  FOR DELETE USING (user_id = (select auth.uid()));
-- Inserts are service-role only (no client insert policy).

-- Column-level: a user may only ever change read_at (mark read), nothing else.
-- The service role (which creates notifications) is unaffected.
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings   JSONB NOT NULL DEFAULT '{}'::jsonb
               CHECK (pg_column_size(settings) < 16384),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_settings_select ON public.user_settings;
CREATE POLICY user_settings_select ON public.user_settings
  FOR SELECT USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS user_settings_insert ON public.user_settings;
CREATE POLICY user_settings_insert ON public.user_settings
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
DROP POLICY IF EXISTS user_settings_update ON public.user_settings;
CREATE POLICY user_settings_update ON public.user_settings
  FOR UPDATE USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
