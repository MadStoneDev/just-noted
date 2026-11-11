-- Add parent_id for nested notebooks (max 2 levels: parent > child)
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES notebooks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_notebooks_parent_id ON notebooks(parent_id);
