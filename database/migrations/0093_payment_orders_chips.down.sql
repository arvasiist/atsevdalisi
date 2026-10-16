-- Çip siparişi varsa geri alma BAŞARISIZ olur (mali kayıt sessizce silinmez).
ALTER TABLE payment_orders DROP CONSTRAINT payment_orders_one_reward;
ALTER TABLE payment_orders DROP COLUMN clawback_shortfall_chips;
ALTER TABLE payment_orders DROP COLUMN chips;
ALTER TABLE payment_orders DROP CONSTRAINT payment_orders_gems_nonneg;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_gems_check CHECK (gems > 0);
