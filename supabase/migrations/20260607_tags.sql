-- Tags table
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_owner ON tags(owner);

-- Junction table for note-tag assignments
CREATE TABLE IF NOT EXISTS note_tags (
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id);

-- RLS for tags
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tags" ON tags
  FOR SELECT USING (auth.uid() = owner);

CREATE POLICY "Users can create own tags" ON tags
  FOR INSERT WITH CHECK (auth.uid() = owner);

CREATE POLICY "Users can update own tags" ON tags
  FOR UPDATE USING (auth.uid() = owner);

CREATE POLICY "Users can delete own tags" ON tags
  FOR DELETE USING (auth.uid() = owner);

CREATE POLICY "Service role full access to tags" ON tags
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS for note_tags
ALTER TABLE note_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tags on own notes" ON note_tags
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM notes WHERE notes.id = note_tags.note_id AND notes.author = auth.uid())
  );

CREATE POLICY "Users can add tags to own notes" ON note_tags
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM notes WHERE notes.id = note_tags.note_id AND notes.author = auth.uid())
  );

CREATE POLICY "Users can remove tags from own notes" ON note_tags
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM notes WHERE notes.id = note_tags.note_id AND notes.author = auth.uid())
  );

CREATE POLICY "Service role full access to note_tags" ON note_tags
  FOR ALL TO service_role USING (true) WITH CHECK (true);
