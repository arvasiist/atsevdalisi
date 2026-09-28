-- 0043 geri alma: COMMENT'leri 0032/0036'nın yazdığı (artık YANLIŞ olan)
-- metinlere döndürür.
--
-- ⚠️ Bu geri alma VERİ KAYBI DEĞİLDİR ama bilgi kaybıdır: eski cümleler
-- `ticketPrice`ın satın alma fiyatı olduğunu ve kapasitenin HENÜZ
-- UYGULANMADIĞINI söyler. Kod geri alınmadıkça (PHASE 7.1 geri alınmadıkça)
-- bu yorumlar şemayı okuyanı yanıltır — yalnızca migration'ın kendisini
-- geri alırken çalıştırın.

COMMENT ON COLUMN race_tickets.price IS 'Satın alma anındaki fiyat (config/grandstand.config.json → ticketPrice). Ledger''daki (economy_transactions) tutarla AYNI olmalıdır.';

COMMENT ON COLUMN races.spectator_capacity IS 'Azami izleyici sayısı (brief §11). Dolduğunda "TRIBUNE FULL". Kapasiteyi UYGULAYAN akış PHASE 6''dadır.';

COMMENT ON COLUMN races.tribune_fee IS 'Tribün giriş ücreti (brief §10). 0 = FREE, >0 = PAID. Ayrı bir tribune_type sütunu yoktur — tip bu değerden türetilir.';
