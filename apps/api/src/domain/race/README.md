# domain/race

Race Engine — brief §6, §15-25; bkz. `docs/RACE_ENGINE.md` ve
`docs/ALGORITHMS.md` §2-8.

- `base-ability.ts` — `computeBaseAbility` (BaseAbility formülü, §2).
- `distance-category.ts` — `getDistanceCategory`, `applyDistanceWeightAdjustments` (§8).
- `environment.ts` — `getEnvironmentModifier` (zemin/hava, §7).
- `pace.ts` — `derivePaceEffect` (önde git/geriden gel, §5).
- `race-engine.ts` — `simulateRace`: segment bazlı simülasyon (§4),
  controlled randomness (§3, seed'e bağlı), overtaking/bloklanma (§6).
  Server-authoritative ve deterministiktir: aynı `simulationSeed` + aynı
  `entries` + aynı config → bit bit aynı `RaceTimeline`.

**Kapsam dışı (FAZ 5'e bırakıldı):** kulvar/boşluk bazlı gerçek overtaking
modeli, 7 aşamalı ayrıntılı jokey AI karar ağacı, "neden kazandım/
kaybettim" açıklaması (`docs/RACE_ENGINE.md` §8-9).

## FAZ 1 wiring, sekizinci dilim — Pratik Yarış (bu oturum)

`simulateRace`'i gerçek bir `Horse`/`HorseStats`'a bağlayan orkestrasyon
(bkz. `application/use-cases/run-practice-race.use-case.ts`):

- `entrant-snapshot.ts` — `buildHorseEntrantSnapshot`: bir oyuncu atını
  `RaceEntrantSnapshot`'a çevirir; `assertValidRaceTactic` taktik
  alanlarını BAĞIMSIZ doğrular (bkz. `errors.ts`). `NEUTRAL_UNMODELED_
  TRAIT_SCORE` (50) — henüz wiring edilmemiş alanlar (surface/distance
  uyumu, jokey) için; bkz. dosya içi "BULUNAN ama KAPSAM DIŞI" notu
  (`horse_surface_stats`/`horse_distance_stats` tabloları VAR ama hiç
  doldurulmuyor — ayrı bir dilimi hak ediyor).
- `bot-generator.ts` — `generateBotEntrants`: gerçek çok oyunculu
  eşleştirme (FAZ 7) henüz wiring edilmediğinden, deterministik (`createSeededRandom`)
  yapay zeka rakipler üretir.
- `validation.ts` — taktik alanları (`RACING_STYLES` vb.) ve
  `PRACTICE_RACE_BOT_COUNT`/`PRACTICE_RACE_DISTANCE_METERS` sabitleri.
- `errors.ts` — `InvalidRaceTacticError`.

Testler: `apps/api/test/domain/race/race-engine.spec.ts` (determinism +
denge testleri, brief §53), `entrant-snapshot.spec.ts`, `bot-generator.spec.ts`.

## FAZ 1 wiring, dokuzuncu dilim — Giriş ücreti + ödül (bu oturum)

`run-practice-race.use-case.ts`'e giriş ücreti + ödül eklendi (brief §31
Economy, docs/SECURITY.md §5):

- `prize.ts` — `getPracticeRaceEntryFee`/`getPracticeRacePrize`: SAF
  fonksiyonlar, `config/economy.config.json`'daki YENİ `practiceRace`
  bloğunu (`baseEntryFee`, `prizeByFinishPosition`) ve önceden hazır ama
  hiç kullanılmamış `raceEntryFeeMultiplier`'ı kullanır. AYRICA
  `applyPracticeRaceStakes` — CI'da bulunan bir hatanın (son sırayı
  bitiren oyuncu için `credit(..., 0, ...)`'ın `wallet.ts`'in sıfır
  miktar kuralına takılıp 500 döndürmesi) düzeltilmiş hali; miktar SIFIR
  olduğunda `debit`/`credit` hiç çağrılmaz.

Bakiye değişikliği (debit+credit) `PlayerRepository.updateWithLock` İÇİNDE,
`UpgradeStableUseCase` ile AYNI desende uygulanır — bkz. use-case'in kendi
doc yorumu. Bu, brief §54'ün Idempotency-Key + Redis altyapısının İLK
gerçek kullanıcısıdır (bkz. `api/idempotency/idempotency.interceptor.ts`,
`app.module.ts`'e artık bağlı olan `RedisModule`).

## FAZ 1 wiring, on dördüncü dilim — PvP Eşleştirme'nin Race Engine kullanımı (bu oturum)

`domain/online/`'daki (brief §41 ONLINE MİMARİ) yeni `JoinMatchmakingQueueUseCase`,
İKİ GERÇEK oyuncunun atını `buildHorseEntrantSnapshot`'la (yukarıda) bir
snapshot'a çevirip AYNI `simulateRace`'i çağırır — bu dosyanın kendisinde
HİÇBİR değişiklik YOKTUR, `domain/online/README.md`'nin "YENİ bir
simülasyon motoru YAZILMADI" notuyla BİREBİR tutarlıdır. Botların (bu
diliminin `bot-generator.ts`'i) AKSİNE, PvP'de İKİ taraf da gerçek `horses`/
`race_entries` satırlarına sahiptir (bkz. `RaceRepository.savePvpMatch`).
