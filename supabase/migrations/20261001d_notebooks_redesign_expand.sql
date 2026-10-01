-- Notebooks redesign — Phase 0 EXPAND migration (see docs/notebooks-redesign-plan.md,
-- spec 03-notebooks.md). Adds the new model columns, backfills them from the
-- existing ones, then locks them with CHECK constraints. The OLD columns
-- (cover_type, cover_value, word_goal, is_hidden, show_hidden_children,
-- display_order) are intentionally KEPT until the new code is stable; a later
-- CONTRACT migration drops them.
--
-- Wrapped in a single transaction so a failed constraint rolls the whole thing
-- back cleanly (no half-applied schema).
--
-- PRE-FLIGHT (run first; the name CHECK at the end fails if this returns rows):
--   SELECT id, name FROM public.notebooks WHERE char_length(name) > 80;
-- Trim or rename any offenders before applying.

BEGIN;

ALTER TABLE public.notebooks
  ADD COLUMN IF NOT EXISTS colour       text    NOT NULL DEFAULT 'violet',
  ADD COLUMN IF NOT EXISTS cover        jsonb   NOT NULL DEFAULT '{"type":"gradient"}'::jsonb,
  ADD COLUMN IF NOT EXISTS description  text,
  ADD COLUMN IF NOT EXISTS goal         jsonb,
  ADD COLUMN IF NOT EXISTS is_private   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_index   integer NOT NULL DEFAULT 0;

-- Backfill colour — mapped from the old flat colour hex (distribution-informed);
-- anything unmapped defaults to violet.
UPDATE public.notebooks SET colour = CASE lower(coalesce(cover_value, ''))
    WHEN '#3b82f6' THEN 'blue'
    WHEN '#2563eb' THEN 'blue'
    WHEN '#6366f1' THEN 'indigo'
    WHEN '#374151' THEN 'indigo'
    WHEN '#8b5cf6' THEN 'violet'
    WHEN '#7c3aed' THEN 'violet'
    WHEN '#ec4899' THEN 'pink'
    WHEN '#db2777' THEN 'pink'
    WHEN '#f97316' THEN 'pink'
    WHEN '#22c55e' THEN 'green'
    WHEN '#16a34a' THEN 'green'
    WHEN '#eab308' THEN 'green'
    ELSE 'violet'
  END
WHERE cover_type = 'color';

-- Backfill the cover union from the old cover_type/cover_value pair. Image covers
-- carry only the url — a missing crop is defaulted to a centred 4:3 crop in code.
UPDATE public.notebooks SET cover = CASE cover_type
    WHEN 'gradient' THEN '{"type":"gradient"}'::jsonb
    WHEN 'color'    THEN '{"type":"flat"}'::jsonb
    WHEN 'photo'    THEN jsonb_build_object('type', 'image', 'url', cover_value)
    WHEN 'custom'   THEN jsonb_build_object('type', 'image', 'url', cover_value)
    ELSE '{"type":"gradient"}'::jsonb
  END;

-- Backfill goal from the old numeric word goal (total goals only; daily comes later).
UPDATE public.notebooks
  SET goal = jsonb_build_object('type', 'total', 'target', word_goal)
  WHERE word_goal IS NOT NULL AND word_goal > 0;

-- Carry manual order across.
UPDATE public.notebooks SET sort_index = COALESCE(display_order, 0);

-- Lock the new columns now that the backfill guarantees valid values.
ALTER TABLE public.notebooks
  ADD CONSTRAINT notebooks_colour_chk
    CHECK (colour IN ('violet', 'violet-light', 'blue', 'indigo', 'pink', 'green')),
  ADD CONSTRAINT notebooks_name_len_chk
    CHECK (char_length(name) <= 80),
  ADD CONSTRAINT notebooks_description_len_chk
    CHECK (description IS NULL OR char_length(description) <= 280),
  ADD CONSTRAINT notebooks_goal_chk
    CHECK (
      goal IS NULL OR (
        (goal->>'type') IN ('daily', 'total')
        AND jsonb_typeof(goal->'target') = 'number'
        AND (goal->>'target')::numeric > 0
      )
    );

COMMIT;
