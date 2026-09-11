DROP TRIGGER IF EXISTS trg_races_updated_at ON races;
DROP TRIGGER IF EXISTS trg_jockeys_updated_at ON jockeys;
DROP TRIGGER IF EXISTS trg_horses_updated_at ON horses;
DROP TRIGGER IF EXISTS trg_players_updated_at ON players;
DROP FUNCTION IF EXISTS set_updated_at();
