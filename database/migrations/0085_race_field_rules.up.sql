-- 15.10.2026 — Aşama 3: yarış başına SAHA KURALI (domain/race/field-rule.ts).
-- Kilit anında hazır gerçek oyuncu min_real_players'ın altındaysa yarış iptal
-- edilir ve herkes iade alır; botlar yalnızca ai_fill izin verirse koşar.
-- Kural yarış açılırken yazılır. Mevcut satırlar ESKİ davranışı korur
-- (1 oyuncu yeter, botlu) — açık yarışların kuralı geriye dönük değişmez.
ALTER TABLE races ADD COLUMN min_real_players INTEGER NOT NULL DEFAULT 1;
ALTER TABLE races ADD COLUMN ai_fill BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE races ADD CONSTRAINT races_min_real_players_valid
  CHECK (min_real_players >= 1 AND min_real_players <= participant_limit);

-- Yarış iptali / katılımın düşürülmesi artık oyuncuya bildirilir (eskiden para
-- sessizce iade ediliyordu). CHECK ADIYLA düşürülüp genişletilir
-- (`notification-types.spec.ts` en son migration'ı okur).
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
  'tribune_gift_received',
  'listing_expired',
  'club_invite',
  'race_cancelled'
));
