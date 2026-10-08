-- 0071 — PROFİL FOTOĞRAFI (08.10.2026, sahibinin isteği: "avatar kısmına
-- kişi fotoğrafını ekleyebilsin"). Oyuncu başına EN FAZLA bir fotoğraf.
-- Baytlar veritabanında DEĞİL avatar deposundadır (`photos/<photo_id>.<uzantı>`,
-- anahtarı YALNIZCA sunucu üretir). `photo_id` her yüklemede yenilenir:
-- herkese açık adres (`/avatar/photos/<photo_id>`) değişir ve eski fotoğraf
-- önbellekten de düşer. Yalnızca ekleme: mevcut tablolara dokunulmaz.
CREATE TABLE player_photos (
  player_id    UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  photo_id     UUID NOT NULL UNIQUE,
  storage_key  TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  width        INTEGER NOT NULL CHECK (width > 0),
  height       INTEGER NOT NULL CHECK (height > 0),
  byte_size    INTEGER NOT NULL CHECK (byte_size > 0),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE player_photos IS 'Oyuncunun profil fotoğrafı (08.10.2026). Meta verisi (EXIF/GPS) silinmiş hâli depoda; satır silinince fotoğraf artık sunulmaz.';
