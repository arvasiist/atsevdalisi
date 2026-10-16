-- 09.10.2026 — KOZMETİK MAĞAZA (elmas politikası: elmas yalnızca görünüş).
-- Oyuncunun elmasla açtığı avatar seçenekleri. Ürün tanımı config'tedir
-- (`config/cosmetics.config.json`); burada yalnızca SAHİPLİK ve ödenen fiyat
-- durur. Birincil anahtar aynı ürünün ikinci kez alınmasını keser. Mali iz
-- `economy_transactions`tadır (`cosmetic_purchase`, elmas) — bu satır silinse
-- de (hesap silme) defter kalır.
CREATE TABLE player_cosmetics (
  player_id   UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_key    TEXT        NOT NULL,
  price_gems  INTEGER     NOT NULL CHECK (price_gems > 0),
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, item_key)
);
