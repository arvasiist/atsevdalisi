-- AUDIT_AND_HARDENING Öncelik 4 (bu oturum) — brief §58 / docs/RACE_ENGINE.md
-- §10: "İlk sürümde video kaydı yerine şu dörtlü saklanır: RaceSeed +
-- RaceConfig(o anki versiyon) + HorseSnapshots + PlayerTactics." `races.
-- simulation_seed` (migration 0006) bu dörtlünün İLK parçasını SOMUTLAŞTIRIYORDU
-- ama "RaceConfig(o anki versiyon)" hiçbir zaman GERÇEK bir sütuna dönüşmedi —
-- yani bugüne kadar hiçbir yarış satırı, HANGİ engine/ruleset/config
-- versiyonuyla üretildiğini kaydetmiyordu. Bu, tek başına bir "eksik özellik"
-- değil, GERÇEK bir bütünlük riskidir: `domain/race/race-engine.ts` veya
-- `config/race.config.json` gelecekte değişirse (brief §52 dengeleme/tuning
-- döngüsü kaçınılmaz olarak bunu gerektirecektir), ESKİ yarışların "aynı
-- seed + aynı snapshot ⇒ aynı sonuç" garantisini hangi kod/config sürümüyle
-- ürettiği artık BİLİNEMEZ hale gelir — replay/audit (brief §58) sessizce
-- YANLIŞ sonuç üretebilir çünkü mevcut kod/config ile yeniden hesaplama YAPILIR,
-- ama o an GEÇERLİ olan kod/config o yarışı ürettiğinde geçerli OLAN ile
-- AYNI olmayabilir.
--
-- Üç ayrı sütun (tek bir "versiyon" değil) bilinçli bir tasarım kararıdır:
--  - engine_version:  `domain/race/race-engine.ts`'in YAPISAL algoritma
--                      sürümü (bkz. `RACE_ENGINE_VERSION` sabiti) — segment
--                      döngüsünün kendisi (FAZ5'in 3-geçişli modeli gibi)
--                      değiştiğinde artırılır.
--  - ruleset_version: pace/overtaking/jockey-decisions/sprint/fatigue gibi
--                      YARDIMCI kural modüllerinin (bkz. `RACE_RULESET_VERSION`
--                      sabiti) sürümü — engine'in 3-geçişli iskeleti AYNI
--                      kalsa bile bu modüllerin İÇ mantığı değişebilir.
--  - config_version:  `config/race.config.json`'ın KENDİ `version` alanı —
--                      kod hiç değişmeden SADECE sayısal denge (weight/
--                      multiplier) değerleri güncellendiğinde de artırılır.
-- Bu ayrım, "kod değişti mi yoksa sadece denge sayıları mı değişti"
-- sorusunun replay/audit sırasında AYRI AYRI cevaplanabilmesini sağlar.
--
-- Mevcut (bu migration'dan ÖNCE yazılmış) satırlar için gerçek bir versiyon
-- bilgisi YOKTUR — bunu icat etmek (ör. sessizce `'1.0.0'` atamak) YANLIŞ
-- bir kesinlik izlenimi verir. Bunun yerine AÇIKÇA `'unknown'` ile
-- işaretlenir (Mutlak Kural 4: "Hiçbir zaman bir riski sessizce kabul etme"
-- — burada risk, mevcut kayıtların hangi sürümle üretildiğinin
-- bilinmemesidir; kabul edilen tek şey BUNUN AÇIKÇA GÖRÜNÜR olmasıdır, veri
-- sessizce doğruymuş gibi davranılmaz). `DROP DEFAULT` ile YENİ satırların
-- HER ZAMAN uygulama kodundan gelen GERÇEK bir değerle yazılması zorunlu
-- kılınır (bkz. `PostgresRaceRepository.insertRaceRow`).
ALTER TABLE races
  ADD COLUMN engine_version   TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN ruleset_version  TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN config_version   TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE races
  ALTER COLUMN engine_version  DROP DEFAULT,
  ALTER COLUMN ruleset_version DROP DEFAULT,
  ALTER COLUMN config_version  DROP DEFAULT;

COMMENT ON COLUMN races.engine_version IS 'domain/race/race-engine.ts RACE_ENGINE_VERSION — bu yarış hangi engine yapısal sürümüyle simüle edildi (deterministic replay için, brief §58)';
COMMENT ON COLUMN races.ruleset_version IS 'domain/race/race-engine.ts RACE_RULESET_VERSION — pace/overtaking/jockey-decisions/sprint/fatigue modüllerinin sürümü';
COMMENT ON COLUMN races.config_version IS 'config/race.config.json içindeki "version" alanı — kod değişmeden SADECE denge sayıları güncellendiğinde de artar';
