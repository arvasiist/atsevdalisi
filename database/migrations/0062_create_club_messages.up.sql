-- 0062 — KULÜP SOHBETİ (02.10.2026, Faz 9, brief §53 CLUB CHAT).
-- Yalnızca üyeler okur/yazar (kapı uygulamada, üyelik satırından).
-- Kulüp dağılınca mesajlar silinir (CASCADE); hesap silinince oyuncunun
-- mesajları silinir (kişisel veri, hesap silme listesinde).
CREATE TABLE club_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- Karakter sınırı `chat.maxMessageLength` ile aynı (yarış sohbetiyle tek kural).
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_club_messages_club_created ON club_messages (club_id, created_at DESC);

COMMENT ON TABLE club_messages IS 'Kulüp sohbeti (Faz 9). Okuma/yazma yalnızca üyelere; kulüp dağılınca silinir.';
