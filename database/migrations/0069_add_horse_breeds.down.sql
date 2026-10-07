ALTER TABLE horses DROP CONSTRAINT IF EXISTS horses_breed_valid;

-- 0069'dan önce var olan atlar asıl metinlerine döner.
UPDATE horses h SET breed = l.breed
FROM horse_breed_legacy l
WHERE l.horse_id = h.id;

-- 0069'dan sonra doğan/alınan atlar anahtardan görünen ada çevrilir.
UPDATE horses SET breed = CASE breed
  WHEN 'thoroughbred' THEN 'Safkan İngiliz'
  WHEN 'arabian' THEN 'Safkan Arap'
  WHEN 'anglo_arab' THEN 'Anglo-Arap'
  WHEN 'quarter_horse' THEN 'Quarter Horse'
  WHEN 'standardbred' THEN 'Standardbred'
  WHEN 'akhal_teke' THEN 'Ahalteke'
  WHEN 'rahvan' THEN 'Rahvan'
  WHEN 'malakan' THEN 'Malakan'
  WHEN 'hinis' THEN 'Hınıs'
  WHEN 'cukurova' THEN 'Çukurova'
  WHEN 'uzunyayla' THEN 'Uzunyayla'
  ELSE breed
END
WHERE id NOT IN (SELECT horse_id FROM horse_breed_legacy);

COMMENT ON COLUMN horses.breed IS NULL;

DROP TABLE IF EXISTS horse_breed_legacy;
