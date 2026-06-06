CREATE TABLE IF NOT EXISTS writing_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  words_written INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_writing_sessions_user_date ON writing_sessions(user_id, date);

ALTER TABLE writing_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own writing sessions" ON writing_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own writing sessions" ON writing_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own writing sessions" ON writing_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to writing_sessions" ON writing_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
