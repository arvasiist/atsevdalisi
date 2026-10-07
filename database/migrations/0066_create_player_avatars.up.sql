-- 0066 — OYUNCU AVATARI (07.10.2026, brief §44 özelleştirme, §49 manuel oluşturucu).
-- Görünüş seçimleri config kataloğunun kimlikleridir (uygulama doğrular).
-- Satır yoksa avatar oyuncu kimliğinden türetilir (varsayılan) — satır
-- yalnızca oyuncu bir seçim KAYDEDİNCE oluşur. Büyük ikili veri YOK.
-- Yalnızca ekleme: mevcut tablolara dokunulmaz.
CREATE TABLE player_avatars (
  player_id   UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  appearance  JSONB NOT NULL CHECK (jsonb_typeof(appearance) = 'object'),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE player_avatars IS 'Oyuncunun kaydettiği manuel avatar (07.10.2026). Yoksa avatar kimlikten türetilir.';
