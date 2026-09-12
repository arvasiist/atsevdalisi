# domain/progression

Seviye/XP sistemi (brief §36) — hem oyuncu hem at ilerlemesi için genel amaçlı.

- `progression.ts` — `getXpRequiredForLevel`, `applyXpGain` (birden fazla
  seviye birden atlanabilir, `maxLevel`'da XP cap'lenir),
  `getUnlocksInRange`/`getUnlockedFeatures`.

XP eğrisi ve unlock listesi `config/progression.config.json`'dan gelir.

Testler: `apps/api/test/domain/progression/progression.spec.ts`.
