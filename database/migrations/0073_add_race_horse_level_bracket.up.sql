-- 0073 — AT SEVİYESİ ARALIKLI YARIŞLAR (08.10.2026, sahibinin isteği:
-- "kişinin at seviyesine göre yarışlar olsun"). NULL = her seviyeye açık
-- (eski satırlar da). Aralık anahtarları `config/race-lobby.config.json` →
-- `horseLevelBrackets` ile BİREBİR aynıdır (`level-bracket.spec.ts` bu kısıtı
-- okuyup karşılaştırır). Aralık eklerken kısıtı ADIYLA düşürüp yeniden yaz.
ALTER TABLE races ADD COLUMN horse_level_bracket TEXT;
ALTER TABLE races ADD CONSTRAINT races_horse_level_bracket_valid
  CHECK (horse_level_bracket IS NULL OR horse_level_bracket IN ('rookie', 'developing', 'master', 'champion'));

COMMENT ON COLUMN races.horse_level_bracket IS
  'At seviyesi aralığı (race-lobby.config.json → horseLevelBrackets). NULL = her seviyeye açık.';
