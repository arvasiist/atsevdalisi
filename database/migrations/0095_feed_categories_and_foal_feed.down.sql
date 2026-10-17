-- Yeni kalemlerle stok/besleme kaydı varsa geri alma BAŞARISIZ olur (kayıt sessizce silinmez).
ALTER TABLE player_feed_inventory DROP CONSTRAINT player_feed_inventory_item_type_check;
ALTER TABLE player_feed_inventory ADD CONSTRAINT player_feed_inventory_item_type_check
  CHECK (item_type IN ('saman', 'arpa', 'mama', 'havuc', 'vitamin'));
ALTER TABLE horse_feed_log DROP CONSTRAINT horse_feed_log_item_type_check;
ALTER TABLE horse_feed_log ADD CONSTRAINT horse_feed_log_item_type_check
  CHECK (item_type IN ('saman', 'arpa', 'mama', 'havuc', 'vitamin'));
