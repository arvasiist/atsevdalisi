# domain/training

Antrenman algoritmaları (docs/ALGORITHMS.md §1, brief §10).

- `training.ts` — `calculateStatGain` (diminishing returns), `calculateFatigueGain`,
  `calculateInjuryRisk`, `applyTraining` (hazır olmayan atlar için
  `HorseNotReadyForTrainingError` fırlatır), `rollInjuryOccurred` (seed'e
  bağlı deterministik sakatlık zarı — `Math.random()` KULLANILMAZ).
- `errors.ts` — `HorseNotReadyForTrainingError`.

Tüm sabitler `config/training.config.json`'dan gelir; kodda sihirli sayı yoktur.

Testler: `apps/api/test/domain/training/training.spec.ts`.
