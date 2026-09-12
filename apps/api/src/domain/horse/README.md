# domain/horse

At durum değerleri ve yaş/gelişim eğrisi (brief §9, §26-27).

- `vital-signs.ts` — `VitalSigns` (health/fitness/fatigue/energy/morale),
  `applyVitalDelta` (saf, [0,100] clamp), `checkTrainingReadiness`
  (`config/training.config.json` → `readinessThresholds`).
- `age-curve.ts` — `getLifeStage`/`getGrowthFactor`
  (`config/horse-growth.config.json`), `calculateAgeInMonths`.

Testler: `apps/api/test/domain/horse/*.spec.ts`.
