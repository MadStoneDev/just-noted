-- Per-user Trash retention preference. Only Scribe honours it (60 or 90 days);
-- Draft is fixed at 30 in application code. Default 60 so existing Scribe rows
-- get the sane default. The window is a *display* filter; a separate cron
-- hard-deletes rows past ~91 days regardless (see /api/admin/cleanup).
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trash_retention_days INTEGER NOT NULL DEFAULT 60;
