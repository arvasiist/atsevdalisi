-- 02.10.2026 — OTURUM GÜVENLİĞİ (master brief §78). Eskiden tek bir 30 günlük
-- JWT vardı ve İPTAL EDİLEMİYORDU (çıkış yalnızca tarayıcıdan silmekti).
--
-- `auth_sessions`: her girişte bir satır. Refresh token'ın YALNIZCA SHA-256
-- özeti saklanır (şifre sıfırlama ile aynı ilke). Her yenilemede değişir;
-- önceki özet `previous_refresh_hash`te tutulur — eski token'ın yeniden
-- kullanılması çalınma işaretidir ve oturumu kapatır.
--
-- `players.tokens_valid_after`: "tüm cihazlardan çık" ve şifre sıfırlama bu
-- andan ÖNCE verilmiş HER erişim token'ını geçersiz kılar (oturumsuz eski
-- token'lar dahil).
CREATE TABLE auth_sessions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id              UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  refresh_token_hash     TEXT NOT NULL,
  previous_refresh_hash  TEXT NULL,
  user_agent             TEXT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at             TIMESTAMPTZ NOT NULL,
  revoked_at             TIMESTAMPTZ NULL,
  revoke_reason          TEXT NULL CHECK (revoke_reason IN ('logout', 'logout_all', 'revoked', 'reuse_detected', 'password_reset', 'account_deleted'))
);

CREATE UNIQUE INDEX auth_sessions_refresh_hash_uq ON auth_sessions (refresh_token_hash);
CREATE INDEX auth_sessions_previous_hash_idx ON auth_sessions (previous_refresh_hash) WHERE previous_refresh_hash IS NOT NULL;
CREATE INDEX auth_sessions_player_active_idx ON auth_sessions (player_id) WHERE revoked_at IS NULL;

ALTER TABLE players ADD COLUMN tokens_valid_after TIMESTAMPTZ NULL;
