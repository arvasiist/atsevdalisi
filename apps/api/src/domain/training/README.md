# domain/training

Antrenman algoritmaları (docs/ALGORITHMS.md §1, brief §10).

- `training.ts` — `calculateStatGain` (diminishing returns), `calculateFatigueGain`,
  `calculateInjuryRisk`, `applyTraining` (hazır olmayan atlar için
  `HorseNotReadyForTrainingError` fırlatır), `rollInjuryOccurred` (seed'e
  bağlı deterministik sakatlık zarı — `Math.random()` KULLANILMAZ),
  `getPrimaryStatKey` (FAZ 1 wiring, dördüncü dilim — antrenman türü →
  görünen stat eşlemesi, bkz. docs/API.md §4 "Antrenman").
- `errors.ts` — `HorseNotReadyForTrainingError`.
- `validation.ts` (FAZ 1 wiring, dördüncü dilim) — `POST /horses/:id/train`
  DTO'su için tek doğruluk kaynağı olan sabitler (`TRAINING_TYPES`,
  `TRAINING_INTENSITIES`, süre sınırları/varsayılanı).

Tüm sabitler `config/training.config.json`'dan gelir; kodda sihirli sayı yoktur.

Testler: `apps/api/test/domain/training/training.spec.ts`.
Wiring: `apps/api/src/application/use-cases/train-horse.use-case.ts`,
`apps/api/src/api/training/`.
