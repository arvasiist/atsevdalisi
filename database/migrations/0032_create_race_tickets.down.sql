-- `race_tickets` geri alınırken bilet satırları da SİLİNİR (down migration
-- bilinçli olarak veri kaybettirir — `0030_create_feed_inventory.down.sql`
-- ile AYNI kabul). `economy_transactions` defteri ETKİLENMEZ: harcama
-- gerçekten olmuştur, geri alma yalnızca "izleme yetkisi"ni kaldırır.
DROP TABLE IF EXISTS race_tickets;
