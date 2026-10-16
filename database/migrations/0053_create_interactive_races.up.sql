-- 01.10.2026 — OYUNCU KONTROLLÜ PRATİK YARIŞ (canlı oturum).
--
-- Oturum sürerken yarış henüz `races` satırı DEĞİLDİR: sonuç oyuncunun
-- komutlarına bağlıdır. Kesinleşince (aynı transaction'da) sıradan bir
-- pratik yarış olarak `races` + `race_entries` + segmentlere yazılır ve bu
-- satır `finished` olur. `id` = kesinleşen yarışın `races.id`'si.
--
-- PARA: giriş ücreti BAŞLANGIÇTA düşer (defter `practice_race_entry_fee`,
-- reference_id = id); ödül kesinleşmede. Terk eden oyuncu ücretten kaçamaz:
-- zamanlayıcı süresi dolan oturumu kendisi kesinleştirir.
--
-- `entrants`: kilit anında DONDURULMUŞ katılımcı snapshot'ları (oyuncu atı +
-- botlar). `commands`: oyuncunun segment komutları (`{"3": {"whips":2,...}}`).

CREATE TABLE interactive_races (
  id            UUID PRIMARY KEY,
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  horse_id      UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  tier_id       TEXT NOT NULL,
  -- GİZLİ tohum: istemciye GİTMEZ. Yarış kimliği tohum olsaydı oyuncu
  -- (açık kaynak motorla) yarışı önceden hesaplayıp en iyi komutları bulurdu.
  simulation_seed UUID NOT NULL,
  tactic        JSONB NOT NULL,
  entrants      JSONB NOT NULL,
  jockey_id     UUID NULL,
  entry_fee     BIGINT NOT NULL CHECK (entry_fee >= 0),
  distance_m    INTEGER NOT NULL CHECK (distance_m > 0),
  surface       TEXT NOT NULL,
  weather       TEXT NOT NULL,
  commands      JSONB NOT NULL DEFAULT '{}'::jsonb,
  starts_at     TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'finished')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ NULL,
  -- Kesinleşme sonucu (PracticeRaceResult) — sonradan açılan sayfa da sonucu görsün.
  result        JSONB NULL
);

-- Oyuncu başına en fazla BİR süren oturum (eşzamanlı iki başlatmayı kısıt keser).
CREATE UNIQUE INDEX interactive_races_one_running_per_player
  ON interactive_races (player_id) WHERE status = 'running';
CREATE INDEX interactive_races_running_idx ON interactive_races (starts_at) WHERE status = 'running';
CREATE INDEX interactive_races_horse_running_idx ON interactive_races (horse_id) WHERE status = 'running';
