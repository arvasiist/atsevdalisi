-- 02.10.2026 — E-POSTA DOĞRULAMA (Faz 1-B.2; 0046/0047'nin devamı).
--
-- `player_credentials.email_verified_at`: kayıtlı e-postanın sahibi
-- olduğunu kanıtladığı an; NULL = doğrulanmamış (0058 öncesi kayıtlar dahil
-- — veri bozulmaz, oyuncu doğrulama bağlantısı isteyebilir).
--
-- Bağlantı YALNIZCA ÖZETİYLE saklanır (SHA-256) ve hangi e-posta için
-- üretildiğini taşır: e-posta değişirse eski bağlantı yeni adresi
-- doğrulayamaz. Tek kullanımlık (`used_at`), süreli (`expires_at`, config
-- `auth.emailVerification.tokenTtlHours`).

ALTER TABLE player_credentials ADD COLUMN email_verified_at TIMESTAMPTZ NULL;

CREATE TABLE email_verification_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX email_verification_tokens_player_idx ON email_verification_tokens (player_id, created_at DESC);

COMMENT ON TABLE email_verification_tokens IS 'E-posta doğrulama bağlantıları (02.10.2026). token_hash = SHA-256(token); düz token SAKLANMAZ. Tek kullanımlık, süreli, e-postaya bağlı.';
