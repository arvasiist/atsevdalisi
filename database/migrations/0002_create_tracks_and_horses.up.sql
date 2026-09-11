-- Hipodrom/pist tablosu (brief §14.1 pist parametrelerini barındırmak için eklendi;
-- Race.track_id alanının referans bütünlüğü için gereklidir).
CREATE TABLE tracks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  location     TEXT,
  length_m     INTEGER,
  turn_count   INTEGER,
  track_width_m NUMERIC(5,2),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tracks IS 'Hipodrom/pist tanımları (brief §14.1)';

-- At tablosu (brief §7 Horse)
CREATE TABLE horses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  gender       TEXT NOT NULL CHECK (gender IN ('mare', 'stallion', 'gelding')),
  breed        TEXT NOT NULL,
  birth_date   DATE NOT NULL,
  level        INTEGER NOT NULL DEFAULT 1,
  xp           BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  quality      NUMERIC(5,2) NOT NULL CHECK (quality BETWEEN 0 AND 100),
  potential    NUMERIC(5,2) NOT NULL CHECK (potential BETWEEN 0 AND 100),
  health       NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (health BETWEEN 0 AND 100),
  fitness      NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (fitness BETWEEN 0 AND 100),
  fatigue      NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (fatigue BETWEEN 0 AND 100),
  energy       NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (energy BETWEEN 0 AND 100),
  morale       NUMERIC(5,2) NOT NULL DEFAULT 80 CHECK (morale BETWEEN 0 AND 100),
  weight_kg    NUMERIC(6,2),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'injured', 'retired', 'resting')),
  sire_id      UUID REFERENCES horses(id) ON DELETE SET NULL,
  dam_id       UUID REFERENCES horses(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE horses IS 'Ana at varlığı ve durum değerleri (brief §7, §9 - health/fitness/fatigue/energy/morale birbirinden bağımsız tutulur)';
