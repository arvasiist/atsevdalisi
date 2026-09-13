-- Günlük Ödül (brief §37) cooldown takibi. `horse_care_log` tablosunun
-- AKSİNE ayrı bir tablo değil, doğrudan `players` üzerinde tek bir
-- nullable sütun — çünkü (Bakım'ın aksine) tek bir oyuncu için tek bir
-- eylem türü vardır, kompozit bir (varlık, eylem türü) anahtarına gerek
-- yoktur.
ALTER TABLE players ADD COLUMN last_daily_reward_claimed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN players.last_daily_reward_claimed_at IS 'Günlük ödülün en son ne zaman talep edildiği — cooldown kontrolü (brief §37)';
