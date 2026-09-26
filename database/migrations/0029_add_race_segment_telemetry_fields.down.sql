ALTER TABLE race_entry_segments
  DROP COLUMN IF EXISTS fatigue_level,
  DROP COLUMN IF EXISTS pace_score;
