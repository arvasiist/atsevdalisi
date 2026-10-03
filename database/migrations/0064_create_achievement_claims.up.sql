-- 0064 — BAŞARIMLAR (03.10.2026, brief §24 "Achievements", §68).
--
-- Başarım TANIMLARI config'tedir (`config/achievements.config.json`),
-- ilerleme mevcut tablolardan yaşam boyu TÜRETİLİR. Saklanan tek olgu
-- alınmış ödüldür. Çift ödemenin TEK kapısı `(player_id, achievement_key)`
-- birincil anahtarıdır; para + defter satırı aynı transaction'da yazılır.
-- Yalnızca ekleme: mevcut tablolara dokunulmaz.
CREATE TABLE achievement_claims (
  id               UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  player_id        UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  achievement_key  TEXT NOT NULL CHECK (achievement_key ~ '^[a-z0-9-]{3,40}$'),
  reward_money     BIGINT NOT NULL CHECK (reward_money > 0),
  claimed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, achievement_key)
);

COMMENT ON TABLE achievement_claims IS 'Alınmış başarım ödülü (03.10.2026). PK çift ödemeyi keser; para + defter satırı aynı transaction''da.';
