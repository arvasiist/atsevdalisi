DROP INDEX IF EXISTS idx_horse_feed_log_horse_fed_at;
ALTER TABLE horses DROP COLUMN IF EXISTS needs_anchor_at;
