/**
 * Ahır (Stable) — brief §32 (temel kapasite), §38 "Ahır Özeti" (at sayısı,
 * ortalama kondisyon, sağlık uyarıları), §39 Ahır Ekranı.
 *
 * FAZ 1 kapsamı yalnızca kapasite kontrolü ve özet hesaplamadır; tam
 * Çiftlik (Farm) bina/personel sistemi FAZ 4'e bırakılmıştır.
 */

import type { StableConfig } from '@at-sevdalisi/game-config';
import { MaxStableLevelReachedError, StableCapacityExceededError } from './errors';

/**
 * Ahır seviyesine karşılık gelen at kapasitesini döner. Tanımsız bir
 * seviye verilirse, o seviyenin ALTINDA tanımlı en yüksek seviyenin
 * kapasitesi kullanılır (örn. seviye 5 tanımlı değilse, seviye 3'ün
 * kapasitesi geçerli olur) — böylece config'de her seviyenin ayrı ayrı
 * tanımlanması zorunlu değildir.
 */
export function getStableCapacity(stableLevel: number, config: StableConfig): number {
  const definedLevels = Object.keys(config.capacityByLevel)
    .map(Number)
    .sort((a, b) => a - b);

  if (definedLevels.length === 0) {
    throw new Error('stable.config.json içinde en az bir seviye tanımlı olmalıdır.');
  }

  const applicableLevel = [...definedLevels].reverse().find((level) => level <= stableLevel) ?? definedLevels[0]!;

  return config.capacityByLevel[String(applicableLevel)]!;
}

export function canAddHorseToStable(currentHorseCount: number, capacity: number): boolean {
  return currentHorseCount < capacity;
}

/** `canAddHorseToStable` false ise `StableCapacityExceededError` fırlatan yardımcı. */
export function assertCanAddHorseToStable(currentHorseCount: number, capacity: number): void {
  if (!canAddHorseToStable(currentHorseCount, capacity)) {
    throw new StableCapacityExceededError(capacity);
  }
}

export interface StableHorseSummaryInput {
  name: string;
  health: number;
  fitness: number;
}

export interface StableSummary {
  horseCount: number;
  capacity: number;
  /** [0, 100] — atların (health + fitness) / 2 ortalaması (brief §38 "Ortalama kondisyon"). */
  averageCondition: number;
  /** health'i `healthWarningThreshold` altında olan atların isimleri. */
  healthWarnings: string[];
}

/** "Ahır Özeti" (brief §38, Ana Sayfa kartı) için özet veri üretir. */
export function summarizeStable(
  horses: StableHorseSummaryInput[],
  capacity: number,
  config: StableConfig,
): StableSummary {
  const horseCount = horses.length;
  const averageCondition =
    horseCount === 0
      ? 0
      : horses.reduce((sum, horse) => sum + (horse.health + horse.fitness) / 2, 0) / horseCount;

  const healthWarnings = horses.filter((horse) => horse.health < config.healthWarningThreshold).map((horse) => horse.name);

  return { horseCount, capacity, averageCondition, healthWarnings };
}

export interface StableUpgradeCost {
  currency: 'money' | 'gems';
  amount: number;
  nextLevel: number;
}

/**
 * FAZ 2 — brief §32 "Upgrade örneği" listesinin devamı. Bir sonraki ahır
 * seviyesine geçmenin maliyetini döner. `config.upgradeCostByLevel`'de
 * tanımlı en yüksek seviyeye zaten ulaşılmışsa `MaxStableLevelReachedError`
 * fırlatır — application layer bu durumda "Yükselt" aksiyonunu hiç
 * göstermemelidir.
 */
export function getNextStableUpgradeCost(currentLevel: number, config: StableConfig): StableUpgradeCost {
  const nextLevel = currentLevel + 1;
  const cost = config.upgradeCostByLevel[String(nextLevel)];
  if (!cost) {
    throw new MaxStableLevelReachedError(currentLevel);
  }
  return { currency: cost.currency, amount: cost.amount, nextLevel };
}

/** Tanımlı en yüksek ahır seviyesini döner (capacityByLevel anahtarlarının en büyüğü). */
export function getMaxDefinedStableLevel(config: StableConfig): number {
  const levels = Object.keys(config.capacityByLevel).map(Number);
  return Math.max(...levels);
}
