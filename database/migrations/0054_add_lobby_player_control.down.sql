ALTER TABLE race_entries DROP COLUMN IF EXISTS player_commands;
ALTER TABLE races DROP COLUMN IF EXISTS live_starts_at, DROP COLUMN IF EXISTS player_control;
