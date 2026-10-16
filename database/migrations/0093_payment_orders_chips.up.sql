-- 16.10.2026 — sahibinin kararı: mağazada ÇİP paketi de satılır (sosyal brief §6).
-- Bir sipariş ya elmas ya çip verir (tam olarak biri). Gerçek para yine YALNIZCA
-- imzalı webhook'la kabul edilir; çip `chip_purchase` defter satırıyla gelir,
-- iadede `chip_purchase_refund` ile geri alınır (harcanmışsa açık kaydedilir).
-- Satın alınan çip arkadaşa gönderilemez (kural `domain/gift/gift.ts`).
-- Yalnızca ekleme + kısıt genişletme: mevcut elmas siparişleri aynen geçerli.
ALTER TABLE payment_orders DROP CONSTRAINT payment_orders_gems_check;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_gems_nonneg CHECK (gems >= 0);
ALTER TABLE payment_orders ADD COLUMN chips BIGINT NOT NULL DEFAULT 0 CHECK (chips >= 0);
ALTER TABLE payment_orders ADD COLUMN clawback_shortfall_chips BIGINT NOT NULL DEFAULT 0 CHECK (clawback_shortfall_chips >= 0);
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_one_reward CHECK ((gems > 0) <> (chips > 0));
