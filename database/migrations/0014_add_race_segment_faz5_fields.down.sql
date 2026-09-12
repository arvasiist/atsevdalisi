ALTER TABLE race_entry_segments
  DROP COLUMN IF EXISTS blocked,
  DROP COLUMN IF EXISTS jockey_decision;
