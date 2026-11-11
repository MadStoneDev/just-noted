-- Category/tag on roadmap items + suggestions: 'fix' or 'feature'. Lets the
-- owner triage by type (fixes are the priority). Nullable — existing/seeded
-- items are uncategorised until set; new suggestions must pick one.
ALTER TABLE roadmap_items
  ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('fix', 'feature'));
