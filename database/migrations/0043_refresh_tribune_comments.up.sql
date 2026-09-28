-- PHASE 7 (29.09.2026) — tribün sütunlarının COMMENT'lerini GERÇEĞE hizalar.
--
-- NEDEN AYRI BİR MIGRATION (0032/0036 dosyaları neden DÜZENLENMEDİ):
-- Uygulanmış bir migration dosyasını sonradan değiştirmek, o dosyayı
-- çalıştırmış bir veritabanı ile hiç çalıştırmamış olanı sessizce
-- AYRIŞTIRIR — şema aynı görünür, COMMENT farklı olur ve bunu hiçbir test
-- söylemez. `CLAUDE.md`'nin "yeni bir RaceStatus eklerken kısıt ADIYLA
-- düşürülür" dersinin aynısı: değişiklik YENİ bir dosyada ifade edilir.
--
-- NEDEN COMMENT ÖNEMSİZ DEĞİL: 0032 ve 0036'nın yazdığı iki cümle artık
-- YANLIŞ ve ikisi de "hiçbir yerde hata üretmeyen" türden:
--
--   1. `race_tickets.price` — "config/grandstand.config.json → ticketPrice"
--      diyordu. Satın alma fiyatının tek kaynağı artık `races.tribune_fee`;
--      config'teki değer yalnızca oluşturma anındaki VARSAYILANdır
--      (`defaultTribuneFee`). Şemayı okuyan biri eski cümleyle, fiyatı
--      değiştirmek için config'i düzenler ve hiçbir şeyin değişmediğini
--      görür — ölü config tuzağının tam olarak kendisi.
--   2. `races.spectator_capacity` — "Kapasiteyi UYGULAYAN akış PHASE 6'dadır"
--      diyordu. Uygulandı (PHASE 7.1): `purchaseTicket` kontenjanı `races`
--      satırı `FOR UPDATE` altındayken doğrular ve `RACE_TRIBUNE_FULL` (409)
--      döner. "Yapılacak" diyen bir yorum, okuyana korumanın OLMADIĞINI
--      düşündürür.

COMMENT ON COLUMN race_tickets.price IS 'Satın alma ANINDAKİ fiyat — `races.tribune_fee`den kopyalanır (PHASE 7.1). İade tutarının tek kaynağı bu sütundur (`refundTicket`), `races.tribune_fee` DEĞİL: yarışın ücreti sonradan değişse bile geçmiş bir satın alma kendi tutarını korur. Ledger''daki (economy_transactions) tutarla AYNI olmalıdır.';

COMMENT ON COLUMN races.spectator_capacity IS 'Azami izleyici sayısı (brief §11). UYGULANIR (PHASE 7.1): `PostgresGrandstandRepository.purchaseTicket` satılan bilet sayısını `races` satırı FOR UPDATE altındayken sayar ve kontenjan dolduysa 409 RACE_TRIBUNE_FULL fırlatır. Sunucu üretimi yarışlar için varsayılan `grandstand.config.json → defaultSpectatorCapacity`.';

COMMENT ON COLUMN races.tribune_fee IS 'Tribün giriş ücreti. 0 = ÜCRETSİZ (bilet SATILMAZ — izlemek için bilet gerekmez, `canWatchRaceWithoutTicket`), >0 = ÜCRETLİ (satın alma fiyatının tek kaynağı BU SÜTUNDUR, PHASE 7.1). Ayrı bir tribune_type sütunu yoktur — tip bu değerden türetilir. Lobi yarışlarında oyuncunun `race-lobby.config.json → tribuneFeeOptions` seçimidir.';
