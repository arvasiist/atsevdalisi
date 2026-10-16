-- 0061 — GÖREVLER + ETKİNLİKLER (02.10.2026, Faz 11-B, brief §68).
--
-- Görev TANIMLARI config'tedir (`config/quests.config.json`), ilerleme
-- mevcut tablolardan TÜRETİLİR — burada yalnızca iki olgu saklanır:
--   1. Yönetimin açtığı süreli etkinlikler (`live_events`).
--   2. Alınmış ödüller (`quest_claims`). Çift ödemenin TEK kapısı
--      `(player_id, quest_key, period_start)` tekilliğidir; para ve defter
--      satırı talep satırıyla AYNI transaction'da yazılır.
-- Yalnızca ekleme: mevcut tablolara dokunulmaz.

CREATE TABLE live_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description   TEXT NOT NULL DEFAULT '',
  metric        TEXT NOT NULL CHECK (metric IN (
                  'races_entered', 'race_wins', 'top3_finishes',
                  'trainings', 'care_actions', 'horse_purchases')),
  target        INTEGER NOT NULL CHECK (target > 0),
  reward_money  BIGINT NOT NULL CHECK (reward_money > 0),
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  created_by    UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at   TIMESTAMPTZ,
  archived_by   UUID REFERENCES players(id) ON DELETE RESTRICT,
  CONSTRAINT live_events_window_check CHECK (ends_at > starts_at),
  CONSTRAINT live_events_archive_check CHECK ((archived_at IS NULL) = (archived_by IS NULL))
);

CREATE INDEX idx_live_events_window ON live_events (ends_at) WHERE archived_at IS NULL;

COMMENT ON TABLE live_events IS 'Yönetimin açtığı süreli etkinlik (Faz 11-B). İlerleme tutulmaz, pencere içinde türetilir.';

CREATE TABLE quest_claims (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- Config görevi için anahtarı (`daily-race-1`), etkinlik için `event:<id>`.
  quest_key     TEXT NOT NULL,
  period_start  TIMESTAMPTZ NOT NULL,
  live_event_id UUID REFERENCES live_events(id) ON DELETE RESTRICT,
  reward_money  BIGINT NOT NULL CHECK (reward_money > 0),
  claimed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quest_claims_once_uq UNIQUE (player_id, quest_key, period_start)
);

CREATE INDEX idx_quest_claims_event ON quest_claims (live_event_id) WHERE live_event_id IS NOT NULL;

COMMENT ON TABLE quest_claims IS 'Alınmış görev/etkinlik ödülü (Faz 11-B). Tekillik kısıtı çift ödemeyi keser; para + defter satırı aynı transaction''da.';
