-- Yem envanteri + besleme kaydı (brief §12 BESLENME SİSTEMİ).
--
-- GEREKÇE: brief §12 besin türlerini listeliyor ama hiçbir yerde "oyuncu
-- yemi SATIN ALIR ve stokta tutar" denmiyordu; bu turda besleme somut
-- kalemlere bağlandı ve şu kural kondu: `arpa`/`mama`/`havuc`/`vitamin`
-- ELMASLA satın alınır ve stokta birikir, `saman` bedavadır ve stoklanmaz
-- (yalnızca at başına günlük sınırla kısıtlanır).
--
-- Bu iki tablo o kuralın iki ayrı yarısıdır:
--   1. `player_feed_inventory` — OYUNCU düzeyinde stok (satın alınan kalemler)
--   2. `horse_feed_log`        — AT düzeyinde kullanım (günlük sınır + denetim)
--
-- `horse_care_log` (migration 0015) ile KARIŞTIRILMAMALIDIR: o tablo
-- (at, eylem türü) başına TEK satır tutar (cooldown için "en son ne zaman"),
-- buradaki ise her beslemeyi AYRI bir satır olarak biriktirir — çünkü
-- sorulan soru "en son ne zaman" değil, "son 24 saatte KAÇ KEZ"dir.

CREATE TABLE player_feed_inventory (
  player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_type  TEXT NOT NULL CHECK (item_type IN ('saman', 'arpa', 'mama', 'havuc', 'vitamin')),
  quantity   INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, item_type)
);

COMMENT ON TABLE player_feed_inventory IS 'Oyuncunun satın aldığı yem stoğu (brief §12). Stoklanmayan kalem (saman) burada HİÇ satır tutmaz — yokluk "stok kavramı yok" demektir, "stok bitti" DEĞİL.';

-- `horse_feed_log` — günlük sınır sorgusunun (COUNT ... WHERE horse_id = $1
-- AND item_type = $2 AND fed_at >= $3) doğrudan karşılığı. Sıralama
-- (horse_id, item_type, fed_at) BİLİNÇLİDİR: sorgu tam olarak bu üçlüyü
-- birlikte kullanır, dolayısıyla index tek başına hem filtreyi hem aralığı
-- karşılar.
CREATE TABLE horse_feed_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id   UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_type  TEXT NOT NULL CHECK (item_type IN ('saman', 'arpa', 'mama', 'havuc', 'vitamin')),
  fed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE horse_feed_log IS 'Her besleme olayı ayrı bir satır (brief §12). Günlük sınır kayan 24 saat penceresiyle sayılır (takvim günü DEĞİL — domain/economy/daily-reward.ts KAPSAM notuyla AYNI basitleştirme).';

CREATE INDEX idx_horse_feed_log_horse_item_time ON horse_feed_log (horse_id, item_type, fed_at);

-- Oyuncunun kendi besleme geçmişi (gelecekteki bir "beslenme geçmişi"
-- ekranı / denetim için) — yukarıdaki index'in ön eki olmadığı için AYRI
-- bir index gerekir.
CREATE INDEX idx_horse_feed_log_player_time ON horse_feed_log (player_id, fed_at);
