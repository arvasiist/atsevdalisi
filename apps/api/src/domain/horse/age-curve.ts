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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Atın yaşını belirleyen iki kimlik alanı (`horses.birth_date` + `aging_started_at`). */
export interface HorseAgeAnchor {
  birthDate: Date;
  /** Hızlı yaşlanmanın başladığı an — yeni atta oluşturulma anı (migration 0084). */
  agingStartedAt: Date;
}

/**
 * 15.10.2026 — S5, sahibinin kararı: OYUN YAŞI (ay). `agingStartedAt` anındaki
 * takvim yaşı + o andan beri geçen gerçek gün × `gameMonthsPerRealDay`.
 * Mevcut atlar migration anındaki yaşlarını korur, sonra hızlanır; tay 0'dan,
 * başlangıç atı 48 aydan başlar. Saat geriye giderse yaş düşmez.
 */
export function computeHorseAgeMonths(anchor: HorseAgeAnchor, now: Date, config: HorseGrowthConfig): number {
  const anchorAgeMonths = calculateAgeInMonths(anchor.birthDate, anchor.agingStartedAt);
  const elapsedDays = Math.max(0, now.getTime() - anchor.agingStartedAt.getTime()) / MS_PER_DAY;
  return anchorAgeMonths + Math.floor(elapsedDays * config.gameMonthsPerRealDay);
}

/** `Horse` (ISO metinli) için kısayol — use-case'ler bunu kullanır. */
export function horseAgeMonths(
  horse: { birthDate: string; agingStartedAt: string },
  now: Date,
  config: HorseGrowthConfig,
): number {
  return computeHorseAgeMonths({ birthDate: new Date(horse.birthDate), agingStartedAt: new Date(horse.agingStartedAt) }, now, config);
}

/** Oyun ayını gerçek süreye (ms) çevirir — bekleme süreleri oyun ayıyla yazılır. */
export function gameMonthsToRealMs(months: number, config: HorseGrowthConfig): number {
  return (months / config.gameMonthsPerRealDay) * MS_PER_DAY;
}

/** API açılışında koşar — bozuk ölçekle yaş NaN ya da sonsuz olurdu. */
export function validateHorseGrowthConfig(config: HorseGrowthConfig): string[] {
  const problems: string[] = [];
  if (!(Number.isFinite(config.gameMonthsPerRealDay) && config.gameMonthsPerRealDay > 0)) {
    problems.push('horse-growth.gameMonthsPerRealDay > 0 sonlu bir sayı olmalı.');
  }
  return problems;
}
