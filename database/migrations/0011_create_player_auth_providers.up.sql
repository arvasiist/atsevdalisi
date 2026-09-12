-- Kimlik doğrulama sağlayıcı bağlantıları (brief §7/§31, karar: Google/Apple
-- Sign-In — proje sahibinin onayı, bkz. docs/ARCHITECTURE.md §10 madde 1).
--
-- `players` tablosunda şifre/e-posta YOKTUR: kimlik doğrulama tamamen
-- Google/Apple tarafından yapılır, biz yalnızca "hangi players.id, hangi
-- sağlayıcının hangi kullanıcısına karşılık geliyor" eşlemesini tutarız.
-- Bir oyuncunun birden fazla sağlayıcıyla giriş yapabilmesine izin verecek
-- şekilde ayrı bir tablo olarak tasarlandı (players : player_auth_providers = 1:N).
CREATE TABLE player_auth_providers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
  -- Sağlayıcının kendi kullanıcı kimliği (Google `sub`, Apple `sub` claim'i).
  provider_user_id    TEXT NOT NULL,
  email               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);

COMMENT ON TABLE player_auth_providers IS
  'Google/Apple Sign-In eşlemesi (brief §7/§31) — players tablosunda şifre/e-posta tutulmaz.';

CREATE INDEX idx_player_auth_providers_player_id ON player_auth_providers(player_id);
