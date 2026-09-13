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
