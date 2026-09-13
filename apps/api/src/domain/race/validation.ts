import type { FinalStretchPlan, RaceTacticInput, RacingStyle, RiskLevel, StartApproach } from '@at-sevdalisi/shared-types';

/**
 * `POST /horses/:id/practice-race` (docs/API.md §4) gövde doğrulaması
 * için TEK doğruluk kaynağı — `RunPracticeRaceDto` bu sabitleri TEKRAR
 * YAZMAZ, buradan içe aktarır (`domain/training/validation.ts` ile AYNI
 * desen).
 */
export const RACING_STYLES: readonly RacingStyle[] = ['front_runner', 'tracker', 'mid_pack', 'closer'];
export const RISK_LEVELS: readonly RiskLevel[] = ['low', 'normal', 'high'];
export const START_APPROACHES: readonly StartApproach[] = ['aggressive', 'balanced', 'controlled'];
export const FINAL_STRETCH_PLANS: readonly FinalStretchPlan[] = ['early_sprint', 'normal', 'late_sprint'];

/** docs/API.md §4 örnek isteği taktik alanlarını GÖNDERMEZ — bu, o durumda kullanılan varsayılan. */
export const DEFAULT_RACE_TACTIC: RaceTacticInput = {
  racingStyle: 'mid_pack',
  riskLevel: 'normal',
  startApproach: 'balanced',
  finalStretchPlan: 'normal',
};

/**
 * KARAR (bu dilim, bilinçli): brief'te bir "pratik yarış" katılımcı sayısı
 * belirtilmez — gerçek çok oyunculu eşleştirme (FAZ 7 Matchmaking) henüz
 * bu dilimin kapsamında değildir (bkz. `docs/ROADMAP.md`). Sabit sayıda
 * yapay zeka (bot) rakip kullanılır.
 */
export const PRACTICE_RACE_BOT_COUNT = 5;

/** Orta mesafe (`config/race.config.json` → `distance.middleMaxMeters: 1800`'in altında). */
export const PRACTICE_RACE_DISTANCE_METERS = 1600;
