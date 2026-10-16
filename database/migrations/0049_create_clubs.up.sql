-- 01.10.2026 — KULÜP (brief §44). Alan mantığı (`domain/club/club.ts`)
-- vardı; tablo, API ve ekran yoktu.
--
-- TEK KULÜP KURALI veritabanında: `club_members.player_id` BİRİNCİL
-- ANAHTARDIR — bir oyuncu aynı anda yalnızca bir kulüpte olabilir;
-- eşzamanlı iki "katıl" isteğinin ikisini birden geçirmesini kısıt engeller.
-- Kulüp adı harf duyarsız tekildir — ama `lower(name)` DEĞİL: `--locale=C`
-- kümesinde `lower()` yalnızca ASCII'yi küçültür ("ÜÇ" ile "üç" ayrı
-- sayılırdı). Anahtar uygulamada üretilir (`domain/club/club.ts`
-- `clubNameKey`, Türkçe kurallarla) ve `name_key`e yazılır.
CREATE TABLE clubs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  name_key    TEXT NOT NULL,
  tag         TEXT NULL,
  logo_id     TEXT NULL,
  leader_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  level       INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  points      BIGINT NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX clubs_name_key_uq ON clubs (name_key);
CREATE INDEX clubs_points_idx ON clubs (points DESC);

CREATE TABLE club_members (
  player_id           UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  club_id             UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  role                TEXT NOT NULL CHECK (role IN ('leader', 'officer', 'member')),
  contribution_points BIGINT NOT NULL DEFAULT 0 CHECK (contribution_points >= 0),
  joined_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX club_members_club_idx ON club_members (club_id);
