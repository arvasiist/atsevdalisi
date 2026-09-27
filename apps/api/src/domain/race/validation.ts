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
 * `PRACTICE_RACE_BOT_COUNT` KALDIRILDI (proje sahibinin açık talebi,
 * 27.09.2026). Eskiden sabit 5'ti (oyuncunun atıyla birlikte 6
 * katılımcı); artık katılımcı sayısı SEÇİLEN KADEMEDEN gelir —
 * `config/economy.config.json` → `raceTiers[].fieldSize` (8/10/12/14/16).
 * Bot sayısı bu değerden türetilir: `fieldSize − 1` (oyuncunun kendi atı).
 * Sabit burada KALSIN denmedi çünkü iki kaynak (sabit + kademe) sessizce
 * ayrışırdı; SİHİRLİ SAYI YOK kuralı gereği tek kaynak config'tir.
 */

/** Orta mesafe (`config/race.config.json` → `distance.middleMaxMeters: 1800`'in altında). */
export const PRACTICE_RACE_DISTANCE_METERS = 1600;
