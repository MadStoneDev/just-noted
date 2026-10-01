-- In-app notifications + a per-user settings store (notification prefs + editor
-- prefs). Notifications are created server-side (service role); a user reads and
-- marks their own. Realtime delivers new ones to the bell.

CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,            -- recipient
  type       TEXT NOT NULL,            -- registry key (see src/lib/notifications.ts)
  actor_id   UUID,                     -- who triggered it
  note_id    UUID,                     -- related note, if any
  data       JSONB,                    -- title/body context (usernames, note title, etc.)
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON public.notifications (user_id, created_at DESC);
-- Fast lookup for "is there an unread one of this type for this note?"
CREATE INDEX IF NOT EXISTS notifications_user_note_type_idx
  ON public.notifications (user_id, note_id, type) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
-- Inserts happen server-side with the service role (no client insert policy).

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id    UUID PRIMARY KEY,
  settings   JSONB NOT NULL DEFAULT '{}'::jsonb,
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
