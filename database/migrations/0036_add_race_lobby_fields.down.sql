-- 0036'nın geri alınması — oyuncunun oluşturduğu ücretli yarış alanları.
--
-- DİKKAT — BU GERİ ALMA VERİ KAYBETTİRİR: `created_by`, `max_players`,
-- `race_type`, `tribune_fee` ve `spectator_capacity` değerleri, bu
-- sütunları kullanan yarış kayıtları için tamamen yok olur. `races`'in
-- 0006'dan gelen kendi sütunları (name, entry_fee, participant_limit, …)
-- DOKUNULMAZ — geri alma yalnızca bu migration'ın eklediklerini kaldırır.
--
-- Kısıtlar AÇIKÇA düşürülür (sütun düşürmenin onları otomatik
-- götüreceği doğru olsa da): `races_name_length` yalnızca `name`'e
-- bağlıdır ve hiçbir sütun düşürülmediği için OTOMATİK GİTMEZ — açıkça
-- yazılmazsa geride kalır ve `races` tablosu bir sonraki `up` çalıştırmasında
-- "constraint already exists" ile düşer.

DROP INDEX IF EXISTS idx_races_created_by_status;

ALTER TABLE races
  DROP CONSTRAINT IF EXISTS races_name_length,
  DROP CONSTRAINT IF EXISTS races_spectator_capacity_positive,
  DROP CONSTRAINT IF EXISTS races_tribune_fee_non_negative,
  DROP CONSTRAINT IF EXISTS races_race_type_matches_fee,
  DROP CONSTRAINT IF EXISTS races_race_type_valid,
  DROP CONSTRAINT IF EXISTS races_max_players_within_field,
  DROP CONSTRAINT IF EXISTS races_max_players_positive;

ALTER TABLE races
  DROP COLUMN IF EXISTS spectator_capacity,
  DROP COLUMN IF EXISTS tribune_fee,
  DROP COLUMN IF EXISTS race_type,
  DROP COLUMN IF EXISTS max_players,
  DROP COLUMN IF EXISTS created_by;
