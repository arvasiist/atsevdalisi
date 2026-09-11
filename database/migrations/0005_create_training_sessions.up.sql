-- Antrenman geçmişi (brief §7 TrainingSession, §10)
CREATE TABLE training_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id         UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('speed', 'sprint', 'stamina', 'start', 'cornering', 'tempo', 'rest')),
  intensity        TEXT NOT NULL CHECK (intensity IN ('low', 'medium', 'high')),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  -- stat_gain: { "speed": 1.2, "stamina": 0.4, ... } biçiminde, hangi stat'ların ne kadar
  -- etkilendiğini saklar. Gerçek uygulama mantığı docs/ALGORITHMS.md'dedir.
  stat_gain        JSONB NOT NULL DEFAULT '{}'::jsonb,
  fatigue_gain     NUMERIC(5,2) NOT NULL DEFAULT 0,
  injury_risk      NUMERIC(5,2) NOT NULL DEFAULT 0,
  injury_occurred  BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE training_sessions IS 'Her antrenman farklı sonuç üretir; diminishing returns docs/ALGORITHMS.md''de tanımlıdır (brief §10)';
