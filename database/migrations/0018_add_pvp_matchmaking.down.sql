DROP INDEX IF EXISTS idx_pvp_matches_player_b_id;
DROP INDEX IF EXISTS idx_pvp_matches_player_a_id;
DROP TABLE IF EXISTS pvp_matches;
DROP TABLE IF EXISTS matchmaking_tickets;
ALTER TABLE players DROP COLUMN IF EXISTS rating;
