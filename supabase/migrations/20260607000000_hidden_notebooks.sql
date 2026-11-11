-- Hidden (private) notebooks: notes excluded from All Notes view
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;
-- Per-parent setting: when viewing this notebook, also show hidden children's notes inline
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS show_hidden_children BOOLEAN NOT NULL DEFAULT false;
