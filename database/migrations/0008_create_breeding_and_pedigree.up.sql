-- Yetiştiricilik çifti (brief §7 BreedingPair, §28)
CREATE TABLE breeding_pairs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mare_id      UUID NOT NULL REFERENCES horses(id),
  stallion_id  UUID NOT NULL REFERENCES horses(id),
  -- prediction: { "speed": [78, 84], "potential": [85, 92], ... } tahmini aralıklar (brief §34 scout mantığıyla tutarlı)
  prediction   JSONB,
  fee          BIGINT NOT NULL DEFAULT 0 CHECK (fee >= 0),
  foal_id      UUID REFERENCES horses(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (mare_id <> stallion_id)
);

COMMENT ON TABLE breeding_pairs IS 'Kalıtım hesaplaması server tarafında yapılır (brief §28)';

-- Soy ağacı (brief §7 Pedigree)
CREATE TABLE pedigrees (
  horse_id       UUID PRIMARY KEY REFERENCES horses(id) ON DELETE CASCADE,
  sire_id        UUID REFERENCES horses(id),
  dam_id         UUID REFERENCES horses(id),
  grand_sire_id  UUID REFERENCES horses(id),
  grand_dam_id   UUID REFERENCES horses(id),
  bloodline      TEXT
);

COMMENT ON TABLE pedigrees IS 'Oyuncuya gösterilen soy bilgisi; tam genetik veri değildir (brief §29)';
