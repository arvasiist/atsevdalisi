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

Testler: `apps/api/test/domain/race/race-engine.spec.ts` (determinism +
denge testleri, brief §53).
