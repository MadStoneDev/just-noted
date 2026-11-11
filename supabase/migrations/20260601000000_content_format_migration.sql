-- Add content_format column to track whether content is HTML or Markdown
ALTER TABLE notes ADD COLUMN IF NOT EXISTS content_format TEXT DEFAULT 'html';

-- Add content_html_backup column to preserve original HTML during migration
ALTER TABLE notes ADD COLUMN IF NOT EXISTS content_html_backup TEXT;

-- Index for querying notes by format (useful for batch migration)
CREATE INDEX IF NOT EXISTS idx_notes_content_format ON notes (content_format);
