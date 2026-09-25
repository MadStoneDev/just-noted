-- Roadmap board: items + votes (see docs/roadmap.md "Roadmap voting & suggestions").
-- Official items and approved community suggestions share one table (source flag).
-- Voting is open to guests (voter_key cookie) and members (user_id); writes go
-- through service-role server actions, so RLS locks direct client access.

CREATE TABLE IF NOT EXISTS roadmap_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'under_review'
    CHECK (status IN ('under_review','planned','in_progress','shipped','declined')),
  source TEXT NOT NULL DEFAULT 'community'
    CHECK (source IN ('official','community')),
  is_public BOOLEAN NOT NULL DEFAULT false,
  vote_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roadmap_items_public_idx ON roadmap_items (is_public, status, sort_order);

CREATE TABLE IF NOT EXISTS roadmap_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  user_id UUID,        -- signed-in voters
  voter_key TEXT,      -- guests: token set in a cookie
  ip TEXT,             -- soft signal only (shared/rotating), never the sole guard
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One vote per member per item, and one per guest token per item.
CREATE UNIQUE INDEX IF NOT EXISTS roadmap_votes_user_unique
  ON roadmap_votes (item_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS roadmap_votes_guest_unique
  ON roadmap_votes (item_id, voter_key) WHERE voter_key IS NOT NULL;

-- Keep the denormalised vote_count in sync.
CREATE OR REPLACE FUNCTION roadmap_sync_vote_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE roadmap_items SET vote_count = vote_count + 1, updated_at = now() WHERE id = NEW.item_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE roadmap_items SET vote_count = GREATEST(0, vote_count - 1), updated_at = now() WHERE id = OLD.item_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roadmap_votes_count ON roadmap_votes;
CREATE TRIGGER roadmap_votes_count
  AFTER INSERT OR DELETE ON roadmap_votes
  FOR EACH ROW EXECUTE FUNCTION roadmap_sync_vote_count();

-- RLS
ALTER TABLE roadmap_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read published roadmap items" ON roadmap_items;
CREATE POLICY "Public can read published roadmap items" ON roadmap_items
  FOR SELECT USING (is_public = true);
DROP POLICY IF EXISTS "Service role manages roadmap items" ON roadmap_items;
CREATE POLICY "Service role manages roadmap items" ON roadmap_items
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

ALTER TABLE roadmap_votes ENABLE ROW LEVEL SECURITY;
-- Votes are written only via service-role server actions (cookie + IP + dedup).
DROP POLICY IF EXISTS "Service role manages roadmap votes" ON roadmap_votes;
CREATE POLICY "Service role manages roadmap votes" ON roadmap_votes
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Seed the official items (only when the table is empty) from the curated list.
INSERT INTO roadmap_items (title, body, status, source, is_public, sort_order)
SELECT * FROM (VALUES
  ('Note conversations', 'Chat on any note, and pin a comment to a specific line or word so everyone knows exactly what you mean.', 'in_progress', 'official', true, 10),
  ('Notifications', 'Know when someone comments, mentions you, or edits a note shared with you.', 'planned', 'official', true, 20),
  ('Richer shared notes', 'Export, print and version history on every shared note — not just your own.', 'planned', 'official', true, 21),
  ('Smarter conversations', 'Summarise a discussion or turn it into edits, right where you''re writing.', 'planned', 'official', true, 22),
  ('Keyboard shortcuts & Help', 'A quick reference to everything, right inside the app.', 'shipped', 'official', true, 30),
  ('Unlimited notebooks on Scribe', 'Organise as much as you like — no notebook cap on Scribe.', 'shipped', 'official', true, 31),
  ('A safer Trash', 'Deleted notes wait in Trash before they''re gone — 30 days on Draft, up to 90 on Scribe.', 'shipped', 'official', true, 32),
  ('Cleaner shared notes', 'Shared notes now match the editor, with live word and character counts.', 'shipped', 'official', true, 33),
  ('"Update ready" prompt', 'When a new version ships, we''ll offer a refresh — and save your note first.', 'shipped', 'official', true, 34)
) AS v(title, body, status, source, is_public, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM roadmap_items);
