DROP INDEX IF EXISTS idx_friend_gifts_refundable;
DROP INDEX IF EXISTS idx_friend_gifts_sender_day;
ALTER TABLE friend_gifts DROP CONSTRAINT IF EXISTS friend_gifts_not_both_collected_and_refunded;
ALTER TABLE friend_gifts DROP COLUMN IF EXISTS refunded_at, DROP COLUMN IF EXISTS send_id, DROP COLUMN IF EXISTS sender_paid;
COMMENT ON TABLE friend_gifts IS 'Dostluk hediyesi (08.10.2026). Gönderen ödemez; toplama friend_gift_collect defter satırı yazar.';
