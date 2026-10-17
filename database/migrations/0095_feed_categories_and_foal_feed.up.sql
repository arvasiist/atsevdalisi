-- 0095 — YEM / TAKVİYE / İLAÇ + TAY YEMİ (16.10.2026, brief §7–§8).
-- Yalnızca kalem kümesi genişler; mevcut stok ve besleme kayıtlarına dokunulmaz.
-- Kalem listesi `config/care.config.json` → `feedTypes` ve
-- `domain/care/validation.ts` → `FEED_TYPES` ile BİREBİR (`feed-catalog.spec.ts`
-- en son migration'ı okuyarak karşılaştırır). Kısıtlar ADIYLA düşürülür.
ALTER TABLE player_feed_inventory DROP CONSTRAINT player_feed_inventory_item_type_check;
ALTER TABLE player_feed_inventory ADD CONSTRAINT player_feed_inventory_item_type_check CHECK (item_type IN (
  'saman', 'arpa', 'mama', 'havuc', 'vitamin',
  'yulaf', 'enerji_yemi', 'kondisyon_yemi', 'tay_yemi', 'elektrolit', 'eklem_takviyesi', 'agri_kesici'
));
ALTER TABLE horse_feed_log DROP CONSTRAINT horse_feed_log_item_type_check;
ALTER TABLE horse_feed_log ADD CONSTRAINT horse_feed_log_item_type_check CHECK (item_type IN (
  'saman', 'arpa', 'mama', 'havuc', 'vitamin',
  'yulaf', 'enerji_yemi', 'kondisyon_yemi', 'tay_yemi', 'elektrolit', 'eklem_takviyesi', 'agri_kesici'
));
-- Tay yetiştirme tavanı at başına ömür boyu sayılır (horse_id, item_type) — mevcut
-- `idx_horse_feed_log_horse_item_time` öneki bu sayımı karşılar; yeni indeks gerekmez.
