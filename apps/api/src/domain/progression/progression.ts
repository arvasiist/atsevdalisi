/**
 * Seviye/XP ilerleme sistemi (brief §36). Hem oyuncu (`Player.level/xp`)
 * hem at (`Horse.level/xp`) için kullanılan genel amaçlı, saf fonksiyonlar.
 * `unlocks` listesi yalnızca oyuncu ilerlemesi için anlamlıdır.
 */

import type { ProgressionConfig, ProgressionUnlock } from '@at-sevdalisi/game-config';

/** Bir sonraki seviyeye ulaşmak için gereken TOPLAM (kümülatif değil, o seviyeye özgü) XP. */
export function getXpRequiredForLevel(level: number, config: ProgressionConfig): number {
  return Math.round(config.xpCurve.baseXpPerLevel * level ** config.xpCurve.exponent);
}

export interface LevelProgressResult {
  level: number;
  xp: number;
  leveledUp: boolean;
  levelsGained: number;
  /** Bu XP kazancıyla yeni açılan özellikler (yalnızca oyuncu ilerlemesi için anlamlı). */
  newlyUnlockedFeatures: string[];
}

/**
 * `xpGained` kadar XP ekler; gerekirse birden fazla seviye birden atlanabilir
 * (örn. büyük bir ödül). `maxLevel`'a ulaşıldığında fazla XP kaybolur (cap).
 */
export function applyXpGain(
  currentLevel: number,
  currentXp: number,
  xpGained: number,
  config: ProgressionConfig,
): LevelProgressResult {
  if (xpGained < 0) {
    throw new Error('xpGained negatif olamaz.');
  }

  let level = currentLevel;
  let xp = currentXp + xpGained;
  let levelsGained = 0;

  while (level < config.maxLevel && xp >= getXpRequiredForLevel(level, config)) {
    xp -= getXpRequiredForLevel(level, config);
    level += 1;
    levelsGained += 1;
  }

  if (level >= config.maxLevel) {
    level = config.maxLevel;
    xp = 0; // Maksimum seviyede XP biriktirmenin bir anlamı yok (brief §36: 1 → 50 sabit üst sınır).
  }

  const newlyUnlockedFeatures =
    levelsGained > 0 ? getUnlocksInRange(currentLevel, level, config.unlocks) : [];

  return { level, xp, leveledUp: levelsGained > 0, levelsGained, newlyUnlockedFeatures };
}

/** `(fromLevelExclusive, toLevelInclusive]` aralığında açılan özellikleri döner. */
export function getUnlocksInRange(
  fromLevelExclusive: number,
  toLevelInclusive: number,
  unlocks: ProgressionUnlock[],
): string[] {
  return unlocks
    .filter((u) => u.level > fromLevelExclusive && u.level <= toLevelInclusive)
    .sort((a, b) => a.level - b.level)
    .map((u) => u.feature);
}

/** Bir oyuncunun mevcut seviyesine kadar açılmış TÜM özellikleri döner. */
export function getUnlockedFeatures(level: number, unlocks: ProgressionUnlock[]): string[] {
  return getUnlocksInRange(0, level, unlocks);
}
