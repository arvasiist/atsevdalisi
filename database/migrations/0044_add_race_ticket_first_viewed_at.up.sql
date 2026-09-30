-- 30.09.2026 — tribün biletinin "kullanıldı" bilgisi (FINAL_PROJECT_AUDIT #37).
--
-- SORUN: bilet YALNIZCA bitmiş yarışa satılır (tekrar izleme — bkz.
-- `assertRaceWatchable`). İade ucu ise hiçbir koşul aramıyordu: oyuncu bileti
-- alıp yarışı izliyor, sonra parasını geri alıyordu = bedava izleme, kalıcı
-- olmayan tribün geliri.
--
-- ÇÖZÜM: bilet sahibine yarış ilk kez BİLET SAYESİNDE açıldığında
-- (`GetRaceTimelineUseCase` — HTTP replay ve canlı `race.subscribe` aynı
-- kapıdan geçer) bu sütun doldurulur. Dolu bilet iade EDİLMEZ
-- (`TICKET_ALREADY_USED`). NULL = hiç izlenmedi → iade açık.
--
-- Mevcut satırlar NULL kalır (geriye dönük "izlendi" bilgisi yoktur); bu,
-- bu migration'dan önce satılmış biletleri iade edilebilir bırakır —
-- eski davranışla aynı, veri uydurulmaz.

ALTER TABLE race_tickets ADD COLUMN first_viewed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN race_tickets.first_viewed_at IS 'Bilet sahibine yarışın ilk kez BİLET SAYESİNDE açıldığı an (GetRaceTimelineUseCase). NULL = hiç izlenmedi. Dolu bilet iade edilmez (TICKET_ALREADY_USED) — izlenmiş yarışın parası geri alınamaz.';
