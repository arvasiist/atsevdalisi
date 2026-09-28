-- `down` migration bilinçli olarak VERİ KAYBETTİRİR (0034/0033/0032 ile AYNI
-- kabul): engel listesi ve şikâyet kayıtları geri alınamaz.
--
-- **İKİ TABLONUN KAYBI AYNI AĞIRLIKTA DEĞİLDİR — ve bu bilinçlidir.**
-- `player_blocks` bir DURUM tablosudur: kaybı, engellenen kişilerin
-- yeniden yazabilmesi demektir (oyuncu engeli yeniden koyabilir).
-- `player_reports` ise bir İHBAR kaydıdır ve kaybı GERİ GETİRİLEMEZ —
-- şikâyet edilen davranışın kanıtı yok olur. Sıra bu yüzden önce engeli,
-- sonra şikâyeti düşürür: kısmi bir geri alma sırasında bile şikâyet
-- kaydı en son kaybolur.
DROP TABLE IF EXISTS player_reports;
DROP TABLE IF EXISTS player_blocks;
