-- Brief §77 Database Indexleri - performans kritik sorgular için.
CREATE INDEX idx_horses_owner_id ON horses (owner_id);
CREATE INDEX idx_horses_level ON horses (level);
CREATE INDEX idx_horses_status ON horses (status);

CREATE INDEX idx_races_start_time ON races (start_time);
CREATE INDEX idx_races_status ON races (status);

CREATE INDEX idx_race_entries_race_id ON race_entries (race_id);
CREATE INDEX idx_race_entries_horse_id ON race_entries (horse_id);
CREATE INDEX idx_race_entry_segments_race_entry_id ON race_entry_segments (race_entry_id);

CREATE INDEX idx_market_listings_status ON market_listings (status);
CREATE INDEX idx_market_listings_price ON market_listings (price);
CREATE INDEX idx_market_listings_created_at ON market_listings (created_at);

CREATE INDEX idx_training_sessions_horse_id ON training_sessions (horse_id);
CREATE INDEX idx_training_sessions_created_at ON training_sessions (created_at);

CREATE INDEX idx_breeding_pairs_mare_id ON breeding_pairs (mare_id);
CREATE INDEX idx_breeding_pairs_stallion_id ON breeding_pairs (stallion_id);

-- Not: Leaderboard.season_id / Leaderboard.player_id indexleri (brief §77) FAZ 7
-- (Online) migration'ında, leaderboard tablosu oluşturulduğunda eklenecektir.
