-- FAZ 1 wiring, on ikinci dilim (bu oturum) — At Pazarı'nın filtrelenebilir
-- tarama listesi (`GET /market/listings`) ve "İlanlarım" (`GET
-- /market/my-listings`) endpoint'leri bu tabloyu İLK KEZ `WHERE`/`ORDER BY`
-- ile sorguluyor. `0007_create_market_listings.up.sql` yalnızca PRIMARY KEY
-- indeksi tanımlamıştı (bkz. o migration'ın yorumu yok — bu, o zaman henüz
-- hiçbir sorgu deseni bilinmediği için normaldi). Şimdi iki gerçek erişim
-- deseni ortaya çıktı, ikisi de kendi indeksini hak ediyor:
--   1. "İlanlarım": WHERE seller_id = ? (bkz. findBySellerId)
--   2. "Tara": WHERE status = ? ORDER BY created_at DESC (bkz. search)

CREATE INDEX idx_market_listings_seller_id ON market_listings (seller_id);

CREATE INDEX idx_market_listings_status_created_at ON market_listings (status, created_at DESC);
