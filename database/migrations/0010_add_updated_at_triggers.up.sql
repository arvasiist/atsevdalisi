-- updated_at kolonlarını otomatik güncelleyen ortak trigger fonksiyonu.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_players_updated_at BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_horses_updated_at BEFORE UPDATE ON horses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_jockeys_updated_at BEFORE UPDATE ON jockeys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_races_updated_at BEFORE UPDATE ON races
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
