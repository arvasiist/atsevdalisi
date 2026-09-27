-- `down` migration bilinçli olarak VERİ KAYBETTİRİR (`0033`/`0032`/`0030` ile
-- AYNI kabul): hediye kayıtları geri alınamaz.
--
-- **DİKKAT — `economy_transactions` SİLİNMEZ ve SİLİNMEMELİDİR.** Hediye
-- gönderimlerinin defter satırları (`gift_send_debit`/`gift_send_credit`)
-- ORADA KALIR: defter bir DENETİM kaydıdır, hediye tablosunun bir eki değil
-- (bkz. migration 0019'un "tek doğruluk kaynağı" notu). Oyuncuların
-- bakiyeleri de geri alınmaz — bu migration yalnızca "kime ne gönderildi"
-- sorusunun cevabını ortadan kaldırır, para hareketini DEĞİL.
DROP TABLE IF EXISTS gift_sends;
