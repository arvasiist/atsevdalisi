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
 * UI'a gösterilmeye hazır "sıradaki yükseltme" teklifi. `StableUpgradeCost`'tan
 * iki farkı var: (1) maliyet iç içe bir nesnede durur (JSON'da `cost.amount`
 * okunur), (2) `nextCapacity` de taşınır — oyuncunun "bu parayı verirsem
 * kapasitem kaç olacak" sorusunu, yükseltmeyi YAPMADAN önce cevaplayabilmesi
 * için. Bu alan olmadan arayüz, para harcayan bir düğmenin fiyatını
 * gösteremezdi.
 */
export interface StableUpgradeOffer {
  nextLevel: number;
  cost: { currency: 'money' | 'gems'; amount: number };
  nextCapacity: number;
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

/**
 * Ahır Özeti ekranının ("Yükselt" düğmesini gösterebilmek için) ihtiyaç
 * duyduğu teklif. `getNextStableUpgradeCost`'un aksine **hata FIRLATMAZ**:
 * en yüksek seviyede `null` döner. Sebep: bu fonksiyon bir OKUMA yolundan
 * (`GetStableSummaryUseCase`) çağrılır ve "zaten en yüksek seviyedesin"
 * durumu bir HATA değil, tamamen normal bir son durumdur. Fırlatan sürümü
 * kullanmak, her okuma isteğinde `MaxStableLevelReachedError`'ı yakalayıp
 * yutmaya zorlardı; `null` bu durumu tip sistemi üzerinden açıkça taşır.
 *
 * Not: `getNextStableUpgradeCost` burada YENİDEN YAZILMADI, çağrıldı —
 * maliyet kuralının tek bir kaynağı olmalı (bkz. CLAUDE.md "SİHİRLİ SAYI
 * YOK" ve `config/stable.config.json`).
 */
export function getNextStableUpgradeOffer(currentLevel: number, config: StableConfig): StableUpgradeOffer | null {
  let upgradeCost: StableUpgradeCost;
  try {
    upgradeCost = getNextStableUpgradeCost(currentLevel, config);
  } catch (error) {
    if (error instanceof MaxStableLevelReachedError) {
      return null;
    }
    // Beklenmeyen bir hata (örn. bozuk config) YUTULMAZ — çağıranın görmesi
    // gerekir. Yalnızca "tavan" durumu `null`'a çevrilir.
    throw error;
  }

  return {
    nextLevel: upgradeCost.nextLevel,
    cost: { currency: upgradeCost.currency, amount: upgradeCost.amount },
    nextCapacity: getStableCapacity(upgradeCost.nextLevel, config),
  };
}

/** Tanımlı en yüksek ahır seviyesini döner (capacityByLevel anahtarlarının en büyüğü). */
export function getMaxDefinedStableLevel(config: StableConfig): number {
  const levels = Object.keys(config.capacityByLevel).map(Number);
  return Math.max(...levels);
}
