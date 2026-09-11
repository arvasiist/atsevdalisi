-- Görünen performans özellikleri (brief §7 HorseStats, §8.1)
CREATE TABLE horse_stats (
  horse_id            UUID PRIMARY KEY REFERENCES horses(id) ON DELETE CASCADE,
  speed               NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (speed BETWEEN 0 AND 100),
  acceleration        NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (acceleration BETWEEN 0 AND 100),
  stamina             NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (stamina BETWEEN 0 AND 100),
  strength            NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (strength BETWEEN 0 AND 100),
  agility             NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (agility BETWEEN 0 AND 100),
  balance             NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (balance BETWEEN 0 AND 100),
  stride_length       NUMERIC(5,2),
  stride_frequency    NUMERIC(5,2),
  start_speed         NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (start_speed BETWEEN 0 AND 100),
  early_speed         NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (early_speed BETWEEN 0 AND 100),
  mid_speed           NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (mid_speed BETWEEN 0 AND 100),
  finish_speed        NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (finish_speed BETWEEN 0 AND 100),
  sprint              NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (sprint BETWEEN 0 AND 100),
  endurance           NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (endurance BETWEEN 0 AND 100),
  cornering           NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (cornering BETWEEN 0 AND 100),
  positioning         NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (positioning BETWEEN 0 AND 100),
  -- Gizli özellikler (brief §8.2) - istemciye doğrudan tam değer olarak gönderilmemelidir,
  -- API katmanında scout tahmini aralığına dönüştürülür (bkz. docs/API.md, docs/ALGORITHMS.md)
  temperament         NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (temperament BETWEEN 0 AND 100),
  focus               NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (focus BETWEEN 0 AND 100),
  courage             NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (courage BETWEEN 0 AND 100),
  competitiveness     NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (competitiveness BETWEEN 0 AND 100),
  stress_resistance   NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (stress_resistance BETWEEN 0 AND 100),
  obedience           NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (obedience BETWEEN 0 AND 100),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE horse_stats IS 'At performans özellikleri; görünen ve gizli özellikler ayrımı brief §8''e göredir';

-- Zemin uyumu (brief §7 HorseSurfaceStats)
CREATE TABLE horse_surface_stats (
  horse_id  UUID PRIMARY KEY REFERENCES horses(id) ON DELETE CASCADE,
  grass     NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (grass BETWEEN 0 AND 100),
  dirt      NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (dirt BETWEEN 0 AND 100),
  wet       NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (wet BETWEEN 0 AND 100),
  heavy     NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (heavy BETWEEN 0 AND 100),
  dry       NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (dry BETWEEN 0 AND 100),
  mud       NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (mud BETWEEN 0 AND 100)
);

-- Mesafe uyumu (brief §7 HorseDistanceStats, §62)
CREATE TABLE horse_distance_stats (
  horse_id        UUID PRIMARY KEY REFERENCES horses(id) ON DELETE CASCADE,
  short_distance  NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (short_distance BETWEEN 0 AND 100),
  middle_distance NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (middle_distance BETWEEN 0 AND 100),
  long_distance   NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (long_distance BETWEEN 0 AND 100)
);

-- Detaylı sağlık verisi (brief §7 HorseHealth) - horses.health'ten farklı olarak
-- veteriner tarafından ortaya çıkarılan detaylı/gizli sağlık bilgisidir (brief §29, §34).
CREATE TABLE horse_health (
  horse_id                UUID PRIMARY KEY REFERENCES horses(id) ON DELETE CASCADE,
  health                  NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (health BETWEEN 0 AND 100),
  injury_risk             NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (injury_risk BETWEEN 0 AND 100),
  recovery_rate           NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (recovery_rate BETWEEN 0 AND 100),
  muscle_condition        NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (muscle_condition BETWEEN 0 AND 100),
  joint_condition         NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (joint_condition BETWEEN 0 AND 100),
  respiratory_condition   NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (respiratory_condition BETWEEN 0 AND 100),
  weight_condition        NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (weight_condition BETWEEN 0 AND 100),
  last_vet_check          TIMESTAMPTZ
);
