-- 0067 — SELFIE → AI AVATAR HATTI (07.10.2026, Faz 8-B, brief §38–49).
--
-- Büyük ikili veri (selfie, GLB, küçük resim) VERİTABANINDA DEĞİL nesne
-- deposundadır; burada yalnızca anahtarlar ve iş durumu tutulur.
--   * avatar_generation_jobs — asenkron iş (HTTP isteği bloklanmaz, §41).
--     Oyuncu başına en fazla BİR etkin iş (kısmi tekil indeks).
--     `selfie_key` iş bitince NULL'a çekilir ve dosya silinir (§48).
--   * player_ai_avatars — oyuncunun HAZIR AI avatarı. Yeni iş başarılı
--     olana kadar eski satır yerinde kalır (§45 "başarısızsa eski korunur").
-- Yalnızca ekleme: mevcut tablolara dokunulmaz.
CREATE TABLE avatar_generation_jobs (
  id               UUID PRIMARY KEY,
  player_id        UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status           TEXT NOT NULL CHECK (status IN (
                     'requested', 'analyzing', 'generating', 'processing', 'ready', 'failed', 'cancelled')),
  provider         TEXT NOT NULL,
  provider_job_id  TEXT,
  consent_version  TEXT NOT NULL,
  consented_at     TIMESTAMPTZ NOT NULL,
  selfie_key       TEXT,
  error_code       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ,
  CONSTRAINT avatar_jobs_finished_check CHECK (
    (status IN ('ready', 'failed', 'cancelled')) = (finished_at IS NOT NULL))
);

CREATE UNIQUE INDEX avatar_jobs_one_active_uq ON avatar_generation_jobs (player_id)
  WHERE status IN ('requested', 'analyzing', 'generating', 'processing');
CREATE INDEX idx_avatar_jobs_active ON avatar_generation_jobs (updated_at)
  WHERE status IN ('requested', 'analyzing', 'generating', 'processing');

CREATE TABLE player_ai_avatars (
  player_id      UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  job_id         UUID NOT NULL REFERENCES avatar_generation_jobs(id) ON DELETE CASCADE,
  model_key      TEXT NOT NULL,
  thumbnail_key  TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE avatar_generation_jobs IS 'Selfie → AI avatar işi (Faz 8-B). İkili veri nesne deposunda; selfie iş bitince silinir.';
COMMENT ON TABLE player_ai_avatars IS 'Oyuncunun hazır AI avatarı (Faz 8-B). Yeni iş başarılı olana kadar eskisi korunur.';
