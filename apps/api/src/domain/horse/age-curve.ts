import type { HorseGrowthConfig, HorseGrowthStage } from '@at-sevdalisi/game-config';

/**
 * Yaş ve gelişim eğrisi (brief §27). Atlar Yavru → Gelişim → Prime →
 * Olgunluk → Yaşlanma aşamalarından geçer; her aşamanın bir growthFactor'ü
 * vardır (config/horse-growth.config.json).
 */

export function getLifeStage(ageMonths: number, config: HorseGrowthConfig): HorseGrowthStage {
  if (config.stages.length === 0) {
    throw new Error('horse-growth.config.json içinde en az bir evre tanımlı olmalıdır.');
  }
  const stage = config.stages.find(
    (s) => ageMonths >= s.minAgeMonths && (s.maxAgeMonths === null || ageMonths < s.maxAgeMonths),
  );
  // Yaş, tanımlı son evrenin üstündeyse (maxAgeMonths: null olan evre), o evrede kalır.
  return stage ?? config.stages[config.stages.length - 1]!;
}

/** growth_factor = age_curve(age) — brief §27 */
export function getGrowthFactor(ageMonths: number, config: HorseGrowthConfig): number {
  return getLifeStage(ageMonths, config).growthFactor;
}

/** Doğum tarihinden bugüne kadar geçen tam ay sayısını hesaplar. */
export function calculateAgeInMonths(birthDate: Date, now: Date = new Date()): number {
  const months =
    (now.getFullYear() - birthDate.getFullYear()) * 12 + (now.getMonth() - birthDate.getMonth());
  // Ay içindeki gün henüz doğum gününe ulaşmadıysa bir ay eksik say.
  const dayAdjustment = now.getDate() < birthDate.getDate() ? -1 : 0;
  return Math.max(0, months + dayAdjustment);
}
