-- Gerekli PostgreSQL uzantıları
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid() için

-- Oyuncu tablosu (brief §7 Player)
CREATE TABLE players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  avatar_id     TEXT,
  level         INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 50),
  xp            BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  money         BIGINT NOT NULL DEFAULT 0 CHECK (money >= 0),
  gems          BIGINT NOT NULL DEFAULT 0 CHECK (gems >= 0),
  reputation    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE players IS 'Oyuncu hesabı ve authoritative para/xp durumu (brief §7, §31, §42)';
