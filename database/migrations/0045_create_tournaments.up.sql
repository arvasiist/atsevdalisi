-- 30.09.2026 — TURNUVA (FINAL_PROJECT_AUDIT #50, brief §35 "Özel kupalar" + §68).
--
-- TASARIM (proje sahibinin kararı, 30.09.2026): turnuvaları SUNUCU otomatik
-- takvimle açar (her kademe için bir açık turnuva) ve turnuva TEK BÜYÜK FİNAL
-- yarışıdır.
--
-- NEDEN AYRI BİR YARIŞ ALTYAPISI DEĞİL: turnuva, bir ücretli lobi yarışının
-- (`races`) üstüne kurulur. Böylece para yolu (giriş ücreti, iade), READY
-- şartı, açık yarış at kilidi, hazırlık kapısı, kilitleme ve otomatik
-- kesinleşme İKİNCİ KEZ yazılmaz. Bu tablo yalnızca turnuvaya ÖZGÜ olanı
-- taşır: kademe ve seviye şartı.
--
-- DURUM SÜTUNU YOK — bilinçli: turnuvanın durumu bağlı yarışın durumundan
-- türetilir (scheduled → kayıt açık, locking → koşuyor, finished → bitti,
-- cancelled → iptal). İkinci bir durum sütunu iki doğruluk kaynağı olurdu.

CREATE TABLE tournaments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id           UUID NOT NULL UNIQUE REFERENCES races(id) ON DELETE CASCADE,
  tier              TEXT NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold')),
  min_player_level  INTEGER NOT NULL CHECK (min_player_level >= 1),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tournaments_tier_idx ON tournaments (tier);

COMMENT ON TABLE tournaments IS 'Turnuva = bir lobi yarışı (races) + kademe + seviye şartı. Durum bağlı yarıştan türetilir. Final botsuz koşulur, ödül online.config.json → tournament.prizeDistributionByPlacement.';
