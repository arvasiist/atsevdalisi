-- 08.10.2026 — jokey formu + yorgunluğu: jokeyin son binişleri her kadro
-- dondurulurken okunur (`findRideHistory`). Veri değişmez, yalnızca indeks.
CREATE INDEX IF NOT EXISTS race_entries_jockey_idx ON race_entries (jockey_id) WHERE jockey_id IS NOT NULL;
