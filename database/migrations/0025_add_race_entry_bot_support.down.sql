-- Bu geri alma, bot satırlarını (`bot_label IS NOT NULL`) SİLER — aksi
-- halde `horse_id`'ye NOT NULL'u geri koymak bu satırlarda İHLAL üretirdi
-- (0021'in down migration'ındaki "veri kaybı" notuyla AYNI dürüstlük
-- ilkesi: bir down migration'ın var olan veriyle uyumsuz bir kısıtı geri
-- getirmesi gerektiğinde, bunu SESSİZCE başarısız bırakmak yerine hangi
-- verinin kaybolacağı AÇIKÇA burada belgelenir).
DROP INDEX IF EXISTS race_entries_race_bot_label_uq;

ALTER TABLE race_entries
  DROP CONSTRAINT IF EXISTS race_entries_horse_xor_bot_chk;

DELETE FROM race_entries WHERE bot_label IS NOT NULL;

ALTER TABLE race_entries
  DROP COLUMN bot_label;

ALTER TABLE race_entries
  ALTER COLUMN horse_id SET NOT NULL;
