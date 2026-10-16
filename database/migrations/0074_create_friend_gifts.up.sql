-- 0074 — DOSTLUK HEDİYESİ (08.10.2026, sahibinin isteği: "arkadaşlar tek tuşla
-- bütün listesindekilere çok cüzi bir çip hediye edebilsin ve toplayabilsin").
--
-- Gönderen HİÇBİR ŞEY ödemez: satır yalnızca "X, Y'ye bugün hediye yolladı"
-- olgusudur. Para alıcı TOPLADIĞINDA (`collected_at`) tek bir
-- `friend_gift_collect` defter satırıyla girer; o satırın referansı
-- `collect_id`dir (aynı toplamadaki bütün hediyeler aynı kimliği taşır).
--
-- Tekrar kapısı `(sender_id, recipient_id, gift_day)` tekilliğidir: aynı
-- kişiye günde (oyun saat dilimi) bir hediye. Yalnızca ekleme; görev ölçütü
-- CHECK'i `friend_gifts_sent` ile yeniden yazılır (ADIYLA).

CREATE TABLE friend_gifts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  recipient_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  amount        BIGINT NOT NULL CHECK (amount > 0),
  gift_day      DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_at  TIMESTAMPTZ,
  collect_id    UUID,
  CONSTRAINT friend_gifts_not_self CHECK (sender_id <> recipient_id),
  CONSTRAINT friend_gifts_once_per_day UNIQUE (sender_id, recipient_id, gift_day),
  CONSTRAINT friend_gifts_collect_pair CHECK ((collected_at IS NULL) = (collect_id IS NULL))
);

CREATE INDEX idx_friend_gifts_pending ON friend_gifts (recipient_id, created_at) WHERE collected_at IS NULL;
CREATE INDEX idx_friend_gifts_collected ON friend_gifts (recipient_id, collected_at) WHERE collected_at IS NOT NULL;
CREATE INDEX idx_friend_gifts_sender ON friend_gifts (sender_id, created_at);

COMMENT ON TABLE friend_gifts IS 'Dostluk hediyesi (08.10.2026). Gönderen ödemez; toplama friend_gift_collect defter satırı yazar.';

-- Görev/etkinlik ölçütü: 0061'deki adsız sütun CHECK'i (otomatik adı
-- live_events_metric_check) ADIYLA düşürülür ve adlı kısıtla yeniden yazılır.
ALTER TABLE live_events DROP CONSTRAINT live_events_metric_check;
ALTER TABLE live_events ADD CONSTRAINT live_events_metric_valid CHECK (metric IN (
  'races_entered', 'race_wins', 'top3_finishes',
  'trainings', 'care_actions', 'horse_purchases', 'friend_gifts_sent'));
