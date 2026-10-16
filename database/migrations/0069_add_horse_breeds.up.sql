-- 07.10.2026 — AT IRKLARI. `horses.breed` artık Türkçe görünen ad DEĞİL, ırk
-- ANAHTARIDIR (`config/breeds.config.json`). Görünen ad config'tedir.
--
-- VERİ KAYBI YOK: dönüşümden önceki metin `horse_breed_legacy`de saklanır ve
-- down migration onu birebir geri yazar.
--
-- Eşleme: o güne kadar her başlangıç atı ve tayı 'Arap' etiketiyle doğuyordu
-- ve statları DB varsayılanıydı (hepsi 50) — yani bugün ÜCRETSİZ başlangıç
-- ırkı olan Hınıs'ın gücündeydi. Sahibinin kuralı "ücretsiz at en zayıf at"
-- olduğu için bu atlar 'hinis' olur; statlarına DOKUNULMAZ. Geliştirme
-- tohumunun (seed) adları kendi ırklarına eşlenir; tanınmayan metin de
-- başlangıç ırkına düşer (asıl metni yedekte kalır).
CREATE TABLE horse_breed_legacy (
  horse_id UUID PRIMARY KEY REFERENCES horses(id) ON DELETE CASCADE,
  breed    TEXT NOT NULL
);

INSERT INTO horse_breed_legacy (horse_id, breed)
SELECT id, breed FROM horses;

UPDATE horses SET breed = CASE breed
  WHEN 'Safkan İngiliz' THEN 'thoroughbred'
  WHEN 'Safkan Arap' THEN 'arabian'
  WHEN 'Anglo-Arap' THEN 'anglo_arab'
  WHEN 'Quarter Horse' THEN 'quarter_horse'
  WHEN 'Standardbred' THEN 'standardbred'
  WHEN 'Ahalteke' THEN 'akhal_teke'
  WHEN 'Rahvan' THEN 'rahvan'
  WHEN 'Malakan' THEN 'malakan'
  WHEN 'Hınıs' THEN 'hinis'
  WHEN 'Çukurova' THEN 'cukurova'
  WHEN 'Uzunyayla' THEN 'uzunyayla'
  ELSE 'hinis'
END;

-- Küme `config/breeds.config.json` ile AYNI olmalıdır — `breeds.spec.ts` bu
-- kısıtı YAZAN en son migration'ı okuyup karşılaştırır. Irk eklerken kısıtı
-- ADIYLA düşürüp yeniden yaz.
ALTER TABLE horses ADD CONSTRAINT horses_breed_valid CHECK (breed IN (
  'hinis', 'malakan', 'rahvan', 'uzunyayla', 'cukurova', 'standardbred',
  'quarter_horse', 'akhal_teke', 'anglo_arab', 'arabian', 'thoroughbred'
));

COMMENT ON COLUMN horses.breed IS 'Irk anahtari (config/breeds.config.json); gorunen ad config''te. 0069 oncesi metin horse_breed_legacy''de.';
