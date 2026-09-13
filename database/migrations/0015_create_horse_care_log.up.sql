-- Bakım eylemi soğuma (cooldown) takibi (brief §11, domain/care/care.ts
-- canPerformCareAction). Beslemenin (feed) bir cooldown'u YOKTUR
-- (config/care.config.json feedTypes'ta cooldownMinutes tanımlı değil),
-- bu yüzden bu tablo yalnızca `groom`/`water`/`clean`/`vet`/`farrier`/
-- `rest` eylemlerini kapsar.
CREATE TABLE horse_care_log (
  horse_id          UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  action_type       TEXT NOT NULL CHECK (action_type IN ('groom', 'water', 'clean', 'vet', 'farrier', 'rest')),
  last_performed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (horse_id, action_type)
);

COMMENT ON TABLE horse_care_log IS 'Her (at, bakım eylemi türü) çifti için en son yapılma zamanı — cooldown kontrolü (brief §11)';
