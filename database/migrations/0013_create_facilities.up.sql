-- Çiftlik (Farm) tesisleri (brief §32, domain/farm). Ahır (`stable`) HARİÇTİR
-- — o zaten `players.stable_level` üzerinden yönetiliyor (bkz. 0012).
-- Her oyuncu her tesis TİPİNDEN en fazla bir kayda sahip olabilir (UNIQUE);
-- level=1 = ilk inşa, satır yoksa "hiç inşa edilmemiş" (level 0) demektir.
CREATE TABLE facilities (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (
    type IN ('paddock', 'training_track', 'vet_center', 'farrier_area', 'breeding_center', 'warehouse', 'staff_building')
  ),
  level      INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, type)
);

COMMENT ON TABLE facilities IS 'Çiftlik tesisleri (brief §32), ahır hariç — bkz. domain/farm/README.md';

CREATE INDEX idx_facilities_owner_id ON facilities(owner_id);

CREATE TRIGGER trg_facilities_updated_at BEFORE UPDATE ON facilities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
