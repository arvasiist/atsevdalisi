-- 0065 — ANTRENMAN/BAKIMI YAPAN OYUNCU (07.10.2026).
--
-- Görevlerin `trainings`/`care_actions` ölçütü atın ŞİMDİKİ sahibine
-- bakıyordu: bugün antrenmanı yapılmış at satılınca aynı günün görevi hem
-- satıcıya hem alıcıya sayılıyordu (iki ödül). Yeni satırlar işi yapan
-- oyuncuyu (işlem anındaki sahip) yazar; eski satırlar NULL kalır ve sorgu
-- eskisi gibi at sahibine düşer — geçmiş için tahmin YAZILMAZ.
-- Yalnızca ekleme: mevcut veri değişmez.
ALTER TABLE training_sessions
  ADD COLUMN player_id UUID REFERENCES players(id) ON DELETE SET NULL;

ALTER TABLE horse_care_log
  ADD COLUMN performed_by UUID REFERENCES players(id) ON DELETE SET NULL;

COMMENT ON COLUMN training_sessions.player_id IS 'Antrenmanı yapan oyuncu (işlem anındaki sahip); NULL = 0065 öncesi satır.';
COMMENT ON COLUMN horse_care_log.performed_by IS 'Son bakımı yapan oyuncu (işlem anındaki sahip); NULL = 0065 öncesi satır.';
