-- 0037 geri alma — katılım sütunları ve kısıtları kaldırılır.
--
-- SIRA ÖNEMLİ: önce kısıtlar ve indeksler, sonra sütunlar. Sütunlar
-- düşürülmeden önce onlara bağlı indeks/kısıt kalmazsa `DROP COLUMN`
-- bağımlılık hatası verir.
DROP INDEX IF EXISTS idx_race_entries_player_id;
DROP INDEX IF EXISTS race_entries_race_player_uq;

ALTER TABLE race_entries DROP CONSTRAINT IF EXISTS race_entries_status_valid;
ALTER TABLE race_entries DROP CONSTRAINT IF EXISTS race_entries_bot_has_no_player_chk;

ALTER TABLE race_entries DROP COLUMN IF EXISTS status;
ALTER TABLE race_entries DROP COLUMN IF EXISTS player_id;
