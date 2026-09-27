-- Geri alma SIRA ÖNEMLİ: `direct_messages` önce düşer (sosyal akışın en dış
-- halkası), sonra `friendships`. İkisi arasında FOREIGN KEY YOKTUR
-- (`direct_messages` arkadaşlığa DEĞİL, doğrudan `players`'a bağlıdır —
-- gerekçe up migration'da), yani teknik olarak sıra zorunlu değildir; ama
-- bağımlılık yönünü okuyucuya doğru anlatan sıra budur.
--
-- `down` migration bilinçli olarak VERİ KAYBETTİRİR (`0032`/`0030` ile AYNI
-- kabul): arkadaşlıklar ve mesajlar geri alınamaz. `players` ve
-- `economy_transactions` ETKİLENMEZ.
DROP TABLE IF EXISTS direct_messages;
DROP TABLE IF EXISTS friendships;
