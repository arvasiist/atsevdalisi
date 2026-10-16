-- 02.10.2026 — MÜZAYEDE BİLDİRİMLERİ. Eski kısıt ADIYLA düşürülür ve aynı
-- adla genişletilmiş hâli eklenir (ikisi birlikte yürürlükte kalsaydı yeni
-- türler çalışma anında reddedilirdi). Liste `domain/social/notification.ts`
-- → `NOTIFICATION_TYPES` ile BİREBİR (`notification-types.spec.ts` bu dosyayı
-- okuyarak denetler).
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
  'auction_refunded'
));
