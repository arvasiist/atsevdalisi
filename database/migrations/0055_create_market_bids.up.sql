-- 02.10.2026 — MÜZAYEDE. `market_listings.listing_type` CHECK'i 'auction'ı
-- 0007'den beri kabul ediyordu ama hiçbir kod yazmıyordu. Teklifler emanet
-- modeliyle tutulur: teklif anında teklif verenin parası düşer (defter
-- `auction_bid_hold`), geçilen teklif aynı transaction'da iade edilir
-- (`auction_bid_refund`). Bir ilanda en fazla BİR "leading/won" teklif olur.
CREATE TABLE market_bids (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
  bidder_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  amount      BIGINT NOT NULL CHECK (amount > 0),
  status      TEXT NOT NULL CHECK (status IN ('leading', 'outbid', 'won', 'refunded')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX market_bids_one_leading_uq
  ON market_bids (listing_id)
  WHERE status IN ('leading', 'won');

CREATE INDEX market_bids_listing_idx ON market_bids (listing_id, created_at DESC);
CREATE INDEX market_bids_bidder_idx ON market_bids (bidder_id, created_at DESC);

-- Zamanlayıcının "süresi dolmuş aktif müzayedeler" taraması için.
CREATE INDEX market_listings_auction_due_idx
  ON market_listings (expires_at)
  WHERE status = 'active' AND listing_type = 'auction';
