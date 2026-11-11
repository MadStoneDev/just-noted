-- Soft delete: notes go to trash instead of being permanently deleted
ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at);
