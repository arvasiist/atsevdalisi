-- 0075 — TRİBÜN HEDİYESİ (08.10.2026, sahibinin isteği: "tribündeki kişiler
-- istedikleri at sahiplerine hediye gönderebilsinler").
--
-- PARA YOLU: gönderen `price` öder (`tribune_gift_debit`), atı o yarışta
-- KOŞTURAN oyuncu `owner_amount`ı alır (`tribune_gift_credit`); fark oyun
-- ekonomisinden çıkar. Satır SİLİNMEZ (mali kayıt). `gift_key` listesi
-- `config/grandstand.config.json` → `tribuneGifts.items` ile BİREBİR
-- (`tribune-gift.spec.ts` en son migration'ı okur).
-- Yalnızca ekleme; bildirim türü CHECK'i ADIYLA düşürülüp genişletilir.

CREATE TABLE tribune_gifts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id       UUID NOT NULL REFERENCES races(id),
  horse_id      UUID NOT NULL REFERENCES horses(id),
  sender_id     UUID NOT NULL REFERENCES players(id),
  recipient_id  UUID NOT NULL REFERENCES players(id),
  gift_key      TEXT NOT NULL,
  price         BIGINT NOT NULL CHECK (price > 0),
  owner_amount  BIGINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tribune_gifts_gift_key_valid CHECK (gift_key IN (
    'carrot', 'apple', 'evil-eye', 'horseshoe', 'rose-garland', 'trophy')),
  CONSTRAINT tribune_gifts_owner_amount_valid CHECK (owner_amount > 0 AND owner_amount <= price),
  CONSTRAINT tribune_gifts_not_self CHECK (sender_id <> recipient_id)
);

CREATE INDEX idx_tribune_gifts_race ON tribune_gifts (race_id, created_at);
CREATE INDEX idx_tribune_gifts_sender ON tribune_gifts (sender_id, created_at);
CREATE INDEX idx_tribune_gifts_horse ON tribune_gifts (horse_id);

COMMENT ON TABLE tribune_gifts IS 'Tribünden at sahibine hediye (08.10.2026). Gönderen öder, koşturan oyuncu payını alır.';

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'friend_request',
  'friend_accepted',
  'race_invite',
  'gift_received',
  'message_received',
  'race_starting',
  'race_finished',
  'prize_won',
  'auction_outbid',
  'auction_won',
  'auction_sold',
  'auction_unsold',
  'auction_refunded',
  'tribune_gift_received'
));
