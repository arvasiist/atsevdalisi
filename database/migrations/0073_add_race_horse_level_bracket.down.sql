ALTER TABLE races DROP CONSTRAINT IF EXISTS races_horse_level_bracket_valid;
ALTER TABLE races DROP COLUMN IF EXISTS horse_level_bracket;
