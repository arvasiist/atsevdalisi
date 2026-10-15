DELETE FROM notifications WHERE type = 'race_cancelled';
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
  'club_invite'
));
ALTER TABLE races DROP CONSTRAINT IF EXISTS races_min_real_players_valid;
ALTER TABLE races DROP COLUMN IF EXISTS ai_fill;
ALTER TABLE races DROP COLUMN IF EXISTS min_real_players;
