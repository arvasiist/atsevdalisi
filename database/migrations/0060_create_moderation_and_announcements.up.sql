-- 02.10.2026 — FAZ 10 + 11-A: moderatör rolü, oyuncu yaptırımları, duyurular.
--
-- ROL: `is_admin` (0041) AYNEN KALIR — bütün yönetim yolları ona dayanır.
-- `is_moderator` yanına eklenir; ikisi birlikte rolü verir (domain
-- `resolveStaffRole`). Rol her istekte VERİTABANINDAN okunur (token'a
-- gömülmez — iptal anında etkili olsun).
--
-- YAPTIRIM: satır SİLİNMEZ (moderasyon kaydı); kaldırma `lifted_*` ile
-- işaretlenir. Etkin = kaldırılmamış VE (süresiz ya da süresi dolmamış).
-- Etkisi oturum kapısındadır (403 ACCOUNT_SUSPENDED). `created_by`/`lifted_by`
-- RESTRICT: "kim yaptı" denetimin ana sorusudur (0041 ile aynı gerekçe).
--
-- DUYURU: yönetici oluşturur/arşivler; oyuncular yalnızca yayındakileri görür.

ALTER TABLE players ADD COLUMN is_moderator BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE player_sanctions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('suspend', 'ban')),
  reason       TEXT NOT NULL,
  created_by   UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NULL,
  lifted_at    TIMESTAMPTZ NULL,
  lifted_by    UUID NULL REFERENCES players(id) ON DELETE RESTRICT,
  lift_reason  TEXT NULL,
  -- Askı her zaman SÜRELİDİR, yasak SÜRESİZDİR.
  CONSTRAINT player_sanctions_duration_valid CHECK (
    (kind = 'suspend' AND expires_at IS NOT NULL) OR (kind = 'ban' AND expires_at IS NULL)
  ),
  CONSTRAINT player_sanctions_lift_consistent CHECK (
    (lifted_at IS NULL AND lifted_by IS NULL AND lift_reason IS NULL)
    OR (lifted_at IS NOT NULL AND lifted_by IS NOT NULL AND lift_reason IS NOT NULL)
  )
);

CREATE INDEX player_sanctions_player_idx ON player_sanctions (player_id, created_at DESC);
CREATE INDEX player_sanctions_active_idx ON player_sanctions (player_id) WHERE lifted_at IS NULL;

CREATE TABLE announcements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  level        TEXT NOT NULL CHECK (level IN ('info', 'warning', 'maintenance')),
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NULL,
  created_by   UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at  TIMESTAMPTZ NULL,
  archived_by  UUID NULL REFERENCES players(id) ON DELETE RESTRICT,
  CONSTRAINT announcements_window_valid CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX announcements_live_idx ON announcements (starts_at) WHERE archived_at IS NULL;

COMMENT ON TABLE player_sanctions IS 'Oyuncu yaptırımları (02.10.2026). Satır silinmez; kaldırma lifted_* ile işaretlenir. Askı süreli, yasak süresiz.';
COMMENT ON TABLE announcements IS 'Oyuncu duyuruları (02.10.2026). Yayında = arşivlenmemiş VE pencere içinde.';
