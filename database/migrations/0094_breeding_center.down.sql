-- Gebelik/teklif varsa geri alma bunları SİLER — yalnızca geliştirme içindir.
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'friend_request', 'friend_accepted', 'race_invite', 'gift_received', 'message_received',
  'race_starting', 'race_finished', 'prize_won', 'auction_outbid', 'auction_won', 'auction_sold',
  'auction_unsold', 'auction_refunded', 'tribune_gift_received', 'listing_expired', 'club_invite',
  'race_cancelled', 'stud_service', 'friend_gift_received', 'gift_sent', 'referral_reward'
));
DROP TABLE pregnancy_checkups;
DROP TABLE breeding_attempts;
ALTER TABLE breeding_offers DROP CONSTRAINT breeding_offers_pregnancy_fk;
DROP TABLE pregnancies;
DROP TABLE breeding_offers;
DROP TABLE stud_listings;
ALTER TABLE horses DROP CONSTRAINT horses_fertility_range;
ALTER TABLE horses DROP COLUMN fertility;
