-- 08.10.2026 — IRKA ÖZEL YARIŞLAR. `NULL` = her ırka açık (bütün mevcut
-- yarışlar böyle kalır — veri değişmez). Doluysa yarışa yalnızca
-- `config/breeds.config.json` → `raceClasses` içindeki ırklar katılır ve
-- botların statları sınıfın ırklarından türetilir.
--
-- Küme config'teki sınıf anahtarlarıyla AYNI olmalıdır — `breeds.spec.ts`
-- bu kısıtı YAZAN en son migration'ı okuyup karşılaştırır. Sınıf eklerken
-- kısıtı ADIYLA düşürüp yeniden yaz.
ALTER TABLE races ADD COLUMN breed_class TEXT NULL;
ALTER TABLE races ADD CONSTRAINT races_breed_class_valid CHECK (
  breed_class IS NULL OR breed_class IN ('native', 'arabian', 'thoroughbred')
);
