-- 0076 — EKİPMAN KATALOĞU (08.10.2026). Ekipman artık yalnızca
-- `config/equipment.config.json` kataloğundan, oyun parasıyla alınır; satır
-- hangi katalog kaleminden geldiğini taşır. Yalnızca ekleme: eski satırlara
-- dokunulmaz — NULL = katalogdan önce oyuncunun kendi tanımladığı eski parça
-- (kalitesi olduğu gibi kalır; ne yapılacağı sahibinin kararı).
ALTER TABLE horse_equipment ADD COLUMN catalog_key TEXT;

COMMENT ON COLUMN horse_equipment.catalog_key IS
  'Katalog kalemi (config/equipment.config.json → key). NULL = katalogdan önceki eski parça.';
