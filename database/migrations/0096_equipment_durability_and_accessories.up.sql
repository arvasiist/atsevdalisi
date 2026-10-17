-- 0096 — EKİPMAN: DAYANIKLILIK, ZEMİNE ÖZEL NAL, KOZMETİK AKSESUAR
-- (16.10.2026, brief §8). Yalnızca ekleme: mevcut satırlara DOKUNULMAZ —
-- yeni sütunlar NULL kalır (= aşınmaz, her zeminde). Önceden alınmış parça
-- oyuncunun malıdır; sonradan ömür biçmek satın alınmış değeri düşürürdü.
--
-- Tip listesi: 0028'in adsız CHECK'i ADIYLA düşürülür ve adlı kısıtla yeniden
-- yazılır (`domain/equipment/validation.ts` → `EQUIPMENT_TYPES` ile BİREBİR;
-- `equipment-durability.spec.ts` en son migration'ı okur).
ALTER TABLE horse_equipment DROP CONSTRAINT horse_equipment_equipment_type_check;
ALTER TABLE horse_equipment ADD CONSTRAINT horse_equipment_type_valid CHECK (equipment_type IN (
  'saddle', 'bridle', 'horseshoe', 'blinkers', 'leg_wraps',
  'halter', 'blanket', 'nameplate', 'collectible'
));

ALTER TABLE horse_equipment
  ADD COLUMN max_races INTEGER CHECK (max_races IS NULL OR max_races > 0),
  ADD COLUMN races_remaining INTEGER CHECK (races_remaining IS NULL OR races_remaining >= 0),
  ADD COLUMN surface TEXT CHECK (surface IS NULL OR surface IN ('grass', 'dirt', 'synthetic')),
  ADD COLUMN worn_out_at TIMESTAMPTZ;

-- Dayanıklılık ya ikisi birden ya hiç; aşınmış parça kuşanılı KALAMAZ.
ALTER TABLE horse_equipment ADD CONSTRAINT horse_equipment_durability_pair
  CHECK ((max_races IS NULL) = (races_remaining IS NULL) AND (races_remaining IS NULL OR races_remaining <= max_races));
ALTER TABLE horse_equipment ADD CONSTRAINT horse_equipment_worn_not_equipped
  CHECK (NOT (equipped AND races_remaining = 0));

COMMENT ON COLUMN horse_equipment.races_remaining IS
  'Kalan yarış. Kuşanılı parçadan her koşulan yarışta 1 düşer (yarışın kayıt transaction''ında); 0 = aşındı. NULL = aşınmaz.';
COMMENT ON COLUMN horse_equipment.surface IS
  'Zemine özel nal: bonus yalnızca bu zeminde. NULL = her zeminde.';
