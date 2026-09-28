-- 0042 geri alma: `locking` durumunu CHECK'ten çıkarır.
--
-- ⚠️ Bu geri alma, `locking` durumunda DURAN bir yarış satırı varsa
-- BAŞARISIZ olur (yeni CHECK onu reddeder) — ve başarısız OLMASI
-- doğrudur: `locking` bir yarış, kadrosu ve seed'i donmuş ama henüz
-- kesinleşmemiş bir yarıştır; durumu sessizce `scheduled`a düşürmek
-- dondurulmuş snapshot'ı "henüz koşmamış" gibi gösterirdi. Önce o
-- yarışları kesinleştirin ya da iptal edin.
ALTER TABLE races DROP CONSTRAINT IF EXISTS races_status_valid;

ALTER TABLE races
  ADD CONSTRAINT races_status_check
  CHECK (status IN ('scheduled', 'in_progress', 'finished', 'cancelled'));
