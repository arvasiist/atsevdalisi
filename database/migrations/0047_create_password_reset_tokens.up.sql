-- 30.09.2026 — ŞİFRE SIFIRLAMA (proje sahibinin talebi; 0046'nın devamı).
--
-- Bağlantı (token) YALNIZCA ÖZETİYLE saklanır (SHA-256): veritabanı
-- sızsa bile bekleyen bağlantılar kullanılamaz. Düz token yalnızca
-- e-postada yaşar.
--
-- TEK KULLANIMLIK: `used_at` dolunca geçersizdir; başarılı bir sıfırlama
-- oyuncunun DİĞER bekleyen bağlantılarını da kullanılmış sayar.
-- SÜRELİ: `expires_at` (config `auth.passwordReset.tokenTtlMinutes`).

CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_player_idx ON password_reset_tokens (player_id, created_at DESC);

COMMENT ON TABLE password_reset_tokens IS 'Şifre sıfırlama bağlantıları (30.09.2026). token_hash = SHA-256(token); düz token SAKLANMAZ. Tek kullanımlık (used_at) ve süreli (expires_at).';
