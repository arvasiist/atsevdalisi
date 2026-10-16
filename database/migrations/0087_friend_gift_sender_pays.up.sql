-- 0087 — DOSTLUK HEDİYESİNİ GÖNDEREN ÖDER (16.10.2026, brief §6.3–6.4).
--
-- 0074'te hediye oyunun bastığı paraydı (gönderen ödemiyordu). Sahibinin yeni
-- kuralı: gönderen her arkadaş için küçük bir tutar öder (günlük gönderim
-- bütçesi config'te), alıcı topladığında alır. Para emanettir:
--   * `sender_paid` — gönderimde düşen tutar (eski satırlar 0: oyunun hediyesi,
--     iade EDİLMEZ).
--   * `send_id`    — aynı "hepsine gönder" işleminin bütün satırları; defterdeki
--     `friend_gift_send` satırının referansı.
--   * `refunded_at` — süresi dolup toplanmamış ödenmiş hediye gönderene
--     `friend_gift_refund` ile döner (gönderenin bir sonraki gönderiminde,
--     kilit altında).
-- Yalnızca ekleme; mevcut satırlar değişmez.

ALTER TABLE friend_gifts
  ADD COLUMN sender_paid BIGINT NOT NULL DEFAULT 0 CHECK (sender_paid >= 0),
  ADD COLUMN send_id UUID,
  ADD COLUMN refunded_at TIMESTAMPTZ;

ALTER TABLE friend_gifts
  ADD CONSTRAINT friend_gifts_not_both_collected_and_refunded
  CHECK (NOT (collected_at IS NOT NULL AND refunded_at IS NOT NULL));

CREATE INDEX idx_friend_gifts_sender_day ON friend_gifts (sender_id, gift_day);
CREATE INDEX idx_friend_gifts_refundable ON friend_gifts (sender_id, created_at)
  WHERE collected_at IS NULL AND refunded_at IS NULL AND sender_paid > 0;

COMMENT ON TABLE friend_gifts IS 'Dostluk hediyesi. 0087: gönderen öder (sender_paid, friend_gift_send), alıcı toplar (friend_gift_collect), süresi dolan ödenmiş hediye gönderene döner (friend_gift_refund).';
