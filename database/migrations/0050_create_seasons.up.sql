-- 01.10.2026 — SEZON (brief §69). `domain/season` vardı; tablo, API ve
-- ekran yoktu.
--
-- Sezon SKORU burada TUTULMAZ: sezon sıralaması bitmiş yarış kayıtlarından
-- (`race_entries` + `races.start_time` sezon penceresi içinde) türetilir —
-- genel sıralamayla aynı kaynak, ikinci bir puan defteri yok (ikisi
-- ayrışamaz). "Sezon reseti ilerlemeyi silmez" kuralı da böylece kendiliğinden
-- sağlanır: hiçbir şey silinmez, yalnızca pencere kayar.
--
-- `rewards_paid_at` ödülün TEK SEFER ödenmesinin kapısıdır: zamanlayıcı
-- satırı `FOR UPDATE` ile kilitler ve NULL değilse ödemez.
CREATE TABLE seasons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number           INTEGER NOT NULL UNIQUE CHECK (number >= 1),
  name             TEXT NOT NULL,
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,
  rewards_paid_at  TIMESTAMPTZ NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT seasons_window_valid CHECK (ends_at > starts_at)
);

CREATE INDEX seasons_window_idx ON seasons (starts_at, ends_at);
