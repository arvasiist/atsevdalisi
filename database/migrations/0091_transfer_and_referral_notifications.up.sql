-- 16.10.2026 — sosyal brief §8: gönderene "çip transferi başarılı" (gift_sent)
-- ve davet ödülü (referral_reward) bildirimleri. CHECK ADIYLA düşürülüp
-- genişletilir (`notification-types.spec.ts` en son migration'ı okur).
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
  'race_cancelled',
  'stud_service',
  'friend_gift_received',
  'gift_sent',
  'referral_reward'
));
