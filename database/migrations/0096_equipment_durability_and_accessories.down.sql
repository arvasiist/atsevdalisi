-- Geri alma: kozmetik satırlar eski tip listesine sığmaz. Oyuncunun satın
-- aldığı parçayı sessizce SİLMEMEK için böyle satır varsa geri alma durur.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM horse_equipment WHERE equipment_type IN ('halter', 'blanket', 'nameplate', 'collectible')) THEN
    RAISE EXCEPTION '0096 geri alınamaz: satın alınmış kozmetik aksesuar var (önce elle karar verin).';
  END IF;
END $$;
ALTER TABLE horse_equipment DROP CONSTRAINT IF EXISTS horse_equipment_worn_not_equipped;
ALTER TABLE horse_equipment DROP CONSTRAINT IF EXISTS horse_equipment_durability_pair;
ALTER TABLE horse_equipment
  DROP COLUMN IF EXISTS worn_out_at,
  DROP COLUMN IF EXISTS surface,
  DROP COLUMN IF EXISTS races_remaining,
  DROP COLUMN IF EXISTS max_races;
ALTER TABLE horse_equipment DROP CONSTRAINT IF EXISTS horse_equipment_type_valid;
ALTER TABLE horse_equipment ADD CONSTRAINT horse_equipment_equipment_type_check
  CHECK (equipment_type IN ('saddle', 'bridle', 'horseshoe', 'blinkers', 'leg_wraps'));
