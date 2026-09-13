-- FAZ 1 wiring, on dördüncü dilim (bu oturum) — PvP Eşleştirme (brief §41
-- ONLINE MİMARİ, §43 "Elo benzeri sistem"). `domain/online/{matchmaking,
-- elo,race-room,errors}.ts` FAZ 7'den beri hazır ama hiç wiring edilmemiş
-- saf fonksiyonlardı (bkz. docs/ROADMAP.md) — bu migration onların
-- ihtiyaç duyduğu kalıcı durumu ekler.

-- brief §43 Elo reytingi — `stable_level`/`last_daily_reward_claimed_at`
-- ile AYNI gerekçeyle doğrudan `players` üzerinde tutulur (ayrı bir
-- `PlayerRating` tablosu YOK, bkz. `packages/shared-types/src/player.ts`
-- `Player.rating` doc yorumu). DEFAULT 1000, `config/online.config.json`
-- → `elo.initialRating` ile BİREBİR aynıdır (ama domain katmanının
-- "her zaman açıkça ayarla, örtük SQL DEFAULT'a güvenme" kuralı gereği,
-- bkz. `postgres-player.repository.ts` `save()` — bu DEFAULT yalnızca bir
-- güvenlik ağıdır, gerçek değer HER ZAMAN `createNewPlayer`'dan gelir).
-- CHECK alt sınırı, `config/online.config.json` → `elo.minRating` (100)
-- ile BİREBİR aynıdır (bkz. `domain/online/elo.ts` `applyEloUpdate`).
ALTER TABLE players ADD COLUMN rating INTEGER NOT NULL DEFAULT 1000 CHECK (rating >= 100);

-- Eşleştirme kuyruğu (brief §41 "Client bekleme odasına girer").
-- `player_id` PRIMARY KEY'dir (`horse_stats.horse_id` ile AYNI "tek satır
-- = tek varlık" deseni) — bir oyuncunun aynı anda yalnızca TEK bir bileti
-- olabilir (bkz. `domain/online/errors.ts` `AlreadyInMatchmakingQueueError`).
-- `rating`, bilet oluşturulduğu ANDAKİ (`players.rating`'in bir SNAPSHOT'ı)
-- değerdir — `domain/online/matchmaking.ts` `findBestMatch`'in beklediği
-- `MatchmakingTicket.rating` alanıyla BİREBİR aynı (standart matchmaking
-- tasarımı: rakip adayların reytingi kuyruğa GİRDİKLERİ anki değerdir).
CREATE TABLE matchmaking_tickets (
  player_id   UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  horse_id    UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL,
  queued_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE matchmaking_tickets IS 'Eşleştirme kuyruğunda bekleyen biletler (brief §41) — bkz. domain/online/matchmaking.ts';

-- Tamamlanmış bir PvP maçının kaydı (brief §41 Race Server akışı).
-- FAZ 1 wiring, on dördüncü dilim'in SENKRON tasarımı gereği `status`
-- pratikte HER ZAMAN 'finished' olarak yazılır (eşleşme anında yarış da
-- simüle edilir, bkz. `JoinMatchmakingQueueUseCase` doc yorumu) —
-- 'matched'/'in_progress' değerleri şemada VAR (ileride gerçek zamanlı
-- bir akışa geçilirse) ama bu dilimde hiç ÜRETİLMEZ.
CREATE TABLE pvp_matches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id       UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  player_a_id   UUID NOT NULL REFERENCES players(id),
  player_b_id   UUID NOT NULL REFERENCES players(id),
  -- NULL = berabere (bkz. domain/online/elo.ts `applyEloUpdate`'in scoreA=0.5 dalı).
  winner_id     UUID REFERENCES players(id),
  status        TEXT NOT NULL CHECK (status IN ('matched', 'in_progress', 'finished', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE pvp_matches IS 'Tamamlanmış/devam eden bir PvP maçı (brief §41) — race_id ile races tablosuna bağlanır, gerçek simülasyon race_entries üzerindendir';

CREATE INDEX idx_pvp_matches_player_a_id ON pvp_matches (player_a_id);
CREATE INDEX idx_pvp_matches_player_b_id ON pvp_matches (player_b_id);
