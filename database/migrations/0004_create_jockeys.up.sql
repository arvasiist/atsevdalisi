-- Jokey tablosu (brief §7 Jockey, §13)
CREATE TABLE jockeys (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  experience         INTEGER NOT NULL DEFAULT 0 CHECK (experience >= 0),
  start_skill        NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (start_skill BETWEEN 0 AND 100),
  tactical_skill     NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (tactical_skill BETWEEN 0 AND 100),
  sprint_skill       NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (sprint_skill BETWEEN 0 AND 100),
  horse_control      NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (horse_control BETWEEN 0 AND 100),
  risk_management    NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (risk_management BETWEEN 0 AND 100),
  track_knowledge    NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (track_knowledge BETWEEN 0 AND 100),
  salary             BIGINT NOT NULL DEFAULT 0 CHECK (salary >= 0),
  owner_id           UUID REFERENCES players(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE jockeys IS 'Jokey varlığı; sadece kozmetik değildir, yarış sonucunu etkiler (brief §13)';
