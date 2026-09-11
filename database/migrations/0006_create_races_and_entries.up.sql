-- Yarış tablosu (brief §7 Race, §14.1)
CREATE TABLE races (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id           UUID REFERENCES tracks(id),
  name               TEXT NOT NULL,
  distance_m         INTEGER NOT NULL CHECK (distance_m > 0),
  surface            TEXT NOT NULL CHECK (surface IN ('grass', 'dirt', 'synthetic')),
  weather            TEXT NOT NULL CHECK (weather IN ('sunny', 'rainy', 'windy', 'cloudy', 'hot', 'cold')),
  temperature_c      NUMERIC(4,1),
  wind_kmh           NUMERIC(4,1),
  humidity_pct       NUMERIC(4,1) CHECK (humidity_pct BETWEEN 0 AND 100),
  participant_limit  INTEGER NOT NULL DEFAULT 12 CHECK (participant_limit > 0),
  entry_fee          BIGINT NOT NULL DEFAULT 0 CHECK (entry_fee >= 0),
  prize_pool         BIGINT NOT NULL DEFAULT 0 CHECK (prize_pool >= 0),
  start_time         TIMESTAMPTZ NOT NULL,
  status             TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'finished', 'cancelled')),
  -- Determinism için (brief §18, §57): aynı seed + aynı snapshot + aynı config = aynı sonuç
  simulation_seed    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE races IS 'Yarış tanımı; sonuç her zaman server tarafında, simulation_seed ile deterministik hesaplanır (brief §6, §18)';

-- Yarış katılımı (brief §7 RaceEntry)
CREATE TABLE race_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id             UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  horse_id            UUID NOT NULL REFERENCES horses(id),
  jockey_id           UUID REFERENCES jockeys(id),
  gate_position       INTEGER,
  tactical_style      TEXT CHECK (tactical_style IN ('front_runner', 'tracker', 'mid_pack', 'closer')),
  risk_level          TEXT CHECK (risk_level IN ('low', 'normal', 'high')),
  -- Yarış anındaki donmuş (snapshot) değerler - brief §56 RaceSnapshot.
  -- Oyuncu yarış sırasında atın temel statını değiştirerek sonucu manipüle edemez.
  horse_snapshot      JSONB,
  final_time_ms       INTEGER,
  finish_position     INTEGER,
  performance_score   NUMERIC(6,2),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (race_id, horse_id)
);

COMMENT ON TABLE race_entries IS 'Bir atın bir yarışa katılımı ve sonucu (brief §7, §56, §57)';

-- Segment bazlı telemetri (brief §19 Segment Tabanlı Yarış, §24 Race Telemetry, §57 segment_data)
CREATE TABLE race_entry_segments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_entry_id       UUID NOT NULL REFERENCES race_entries(id) ON DELETE CASCADE,
  segment_distance_m  INTEGER NOT NULL,
  timestamp_ms        INTEGER NOT NULL,
  position_m          NUMERIC(8,2) NOT NULL,
  speed               NUMERIC(6,2),
  stamina             NUMERIC(5,2),
  fatigue             NUMERIC(5,2),
  lane                INTEGER,
  tactical_state      TEXT,
  current_rank        INTEGER
);

COMMENT ON TABLE race_entry_segments IS 'Debug/replay için segment telemetrisi; oyuncuya tam olarak gösterilmek zorunda değildir (brief §24)';
