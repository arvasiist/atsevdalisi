# domain/horse

At durum değerleri ve yaş/gelişim eğrisi (brief §9, §26-27).

- `vital-signs.ts` — `VitalSigns` (health/fitness/fatigue/energy/morale),
  `applyVitalDelta` (saf, [0,100] clamp), `checkTrainingReadiness`
  (`config/training.config.json` → `readinessThresholds`).
- `age-curve.ts` — `getLifeStage`/`getGrowthFactor`
  (`config/horse-growth.config.json`), `calculateAgeInMonths`.
- `weight.ts` — R4 (Carried Weight, sadece at vücut ağırlığı alt-faktörü,
  bu turda EKLENDİ) `generateBellCurveWeightKg`: bağımsız üç tekdüze
  ([0,1)) örnekten (Irwin-Hall/Bates n=3 yaklaşımı) gerçekçi, çeşitlilik
  gösteren bir `weight_kg` (kg) üretir — `horse.ts`'teki
  `generateStarterHorseWeightKg` VE `../breeding/breeding.ts`'teki
  `breedHorses`'un (foal ağırlığı) İKİ tüketicisi. Saf matematik, at/
  breeding kavramı bilmez.

Testler: `apps/api/test/domain/horse/*.spec.ts`.
