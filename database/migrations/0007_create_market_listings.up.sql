-- At pazarı ilanı (brief §7 MarketListing, §30)
CREATE TABLE market_listings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  horse_id      UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  price         BIGINT NOT NULL CHECK (price >= 0),
  listing_type  TEXT NOT NULL CHECK (listing_type IN ('fixed_price', 'auction')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'expired', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ
);

COMMENT ON TABLE market_listings IS 'At pazarı ilanları; fiyat modeli docs/ECONOMY.md''de (brief §30)';
