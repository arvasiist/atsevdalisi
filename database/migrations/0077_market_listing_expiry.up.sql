-- 0077 — SABİT FİYATLI İLAN SÜRE DOLUMU (08.10.2026).
--
-- Süre dolumu artık bir zamanlayıcıyla (ve okuma anında aynı atomik
-- ifadeyle) yazılır; satıcıya `listing_expired` bildirimi AYNI ifadede
-- düşer. Zamanlayıcının taraması için kısmi indeks (müzayedenin
-- `market_listings_auction_due_idx` kardeşi). Bildirim türü CHECK'i ADIYLA
-- düşürülüp genişletilir (`notification-types.spec.ts` en son migration'ı okur).

CREATE INDEX market_listings_fixed_price_due_idx
  ON market_listings (expires_at)
  WHERE status = 'active' AND listing_type = 'fixed_price';

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
  'listing_expired'
));
