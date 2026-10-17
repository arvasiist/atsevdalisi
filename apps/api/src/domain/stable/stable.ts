/**
 * Ahır (Stable) — brief §32 (temel kapasite), §38 "Ahır Özeti" (at sayısı,
 * ortalama kondisyon, sağlık uyarıları), §39 Ahır Ekranı.
 *
 * FAZ 1 kapsamı yalnızca kapasite kontrolü ve özet hesaplamadır; tam
 * Çiftlik (Farm) bina/personel sistemi FAZ 4'e bırakılmıştır.
 */

import type { StableConfig } from '@at-sevdalisi/game-config';
import { MaxStableLevelReachedError, StableCapacityExceededError, StableUpgradeLevelLockedError } from './errors';

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
  nextName: string;
  nextRecoveryBonusPercent: number;
  requiredPlayerLevel: number;
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
    nextName: getStableName(upgradeCost.nextLevel, config),
    nextRecoveryBonusPercent: getStableRecoveryBonusPercent(upgradeCost.nextLevel, config),
    requiredPlayerLevel: getRequiredPlayerLevelForStable(upgradeCost.nextLevel, config),
  };
}

/** Tanımlı en yüksek ahır seviyesini döner (capacityByLevel anahtarlarının en büyüğü). */
export function getMaxDefinedStableLevel(config: StableConfig): number {
  const levels = Object.keys(config.capacityByLevel).map(Number);
  return Math.max(...levels);
}

// ─── 16.10.2026 — AHIR GELİŞTİRME: ad, konfor bonusu, oyuncu seviyesi şartı ───

/** `capacityByLevel` ile AYNI kural: tanımlı en yakın alt seviyenin değeri. */
function applicableValue<T>(map: Record<string, T>, stableLevel: number, fallback: T): T {
  const levels = Object.keys(map)
    .map(Number)
    .filter((level) => level <= stableLevel)
    .sort((a, b) => b - a);
  const key = levels[0];
  return key === undefined ? fallback : map[String(key)]!;
}

export function getStableName(stableLevel: number, config: StableConfig): string {
  return applicableValue(config.nameByLevel, stableLevel, `Seviye ${stableLevel}`);
}

/**
 * Konfor bonusu: zamanla toparlanmanın (enerji + yorgunluk) çarpanı. Seviye 1
 * = 1 (eski davranış). Zamanlayıcı, yarışın kayıt yolu ve ahır listesindeki
 * tahmin bu fonksiyonun SQL karşılığını/kendisini kullanır.
 */
export function getStableRecoveryMultiplier(stableLevel: number, config: StableConfig): number {
  return 1 + applicableValue(config.recoveryBonusByLevel, stableLevel, 0);
}

export function getStableRecoveryBonusPercent(stableLevel: number, config: StableConfig): number {
  return Math.round(applicableValue(config.recoveryBonusByLevel, stableLevel, 0) * 100);
}

export function getRequiredPlayerLevelForStable(targetLevel: number, config: StableConfig): number {
  return config.requiredPlayerLevelByLevel[String(targetLevel)] ?? 1;
}

/** Yükseltme kilit altında, paradan ÖNCE çağrılır. */
export function assertCanUpgradeStable(playerLevel: number, targetLevel: number, config: StableConfig): void {
  const required = getRequiredPlayerLevelForStable(targetLevel, config);
  if (playerLevel < required) {
    throw new StableUpgradeLevelLockedError(playerLevel, required);
  }
}

/**
 * SQL'e geçirilecek seviye → çarpan tablosu (artan seviye). Toparlanma
 * ifadeleri oyuncunun `stable_level`ine en yakın alt seviyenin çarpanını seçer.
 */
export function stableRecoveryTable(config: StableConfig): { levels: number[]; multipliers: number[] } {
  const levels = Object.keys(config.recoveryBonusByLevel)
    .map(Number)
    .sort((a, b) => a - b);
  return { levels, multipliers: levels.map((level) => getStableRecoveryMultiplier(level, config)) };
}

export interface StableLevelRow {
  level: number;
  name: string;
  capacity: number;
  recoveryBonusPercent: number;
  requiredPlayerLevel: number | null;
  cost: { currency: 'money' | 'gems'; amount: number } | null;
}

/** Ahırın bütün seviyeleri (yol haritası) — ekran ve sunucu aynı config'ten. */
export function listStableLevels(config: StableConfig): StableLevelRow[] {
  const max = getMaxDefinedStableLevel(config);
  const rows: StableLevelRow[] = [];
  for (let level = 1; level <= max; level += 1) {
    const cost = config.upgradeCostByLevel[String(level)];
    rows.push({
      level,
      name: getStableName(level, config),
      capacity: getStableCapacity(level, config),
      recoveryBonusPercent: getStableRecoveryBonusPercent(level, config),
      requiredPlayerLevel: level === 1 ? null : getRequiredPlayerLevelForStable(level, config),
      cost: level === 1 || !cost ? null : { currency: cost.currency, amount: cost.amount },
    });
  }
  return rows;
}

/**
 * API açılışında koşar — bozuk ahır config'iyle API AÇILMAZ. Seviyeler 1..N
 * boşluksuz; kapasite, bedel, konfor bonusu ve oyuncu seviyesi şartı
 * azalmaz; bonus [0, 1); şart ≤ oyunun azami seviyesi; her seviyenin adı var.
 */
export function validateStableConfig(config: StableConfig, maxPlayerLevel: number): void {
  const fail = (message: string): never => {
    throw new Error(`Ahır config'i geçersiz (config/stable.config.json): ${message}`);
  };
  const max = getMaxDefinedStableLevel(config);
  let previous: { capacity: number; cost: number; bonus: number; required: number } | null = null;
  for (let level = 1; level <= max; level += 1) {
    const key = String(level);
    const capacity = config.capacityByLevel[key];
    const bonus = config.recoveryBonusByLevel[key];
    const name = config.nameByLevel[key];
    if (!Number.isInteger(capacity) || capacity! <= 0) fail(`seviye ${level} kapasitesi eksik/geçersiz.`);
    if (bonus === undefined || !(bonus >= 0 && bonus < 1)) fail(`seviye ${level} konfor bonusu [0, 1) dışında.`);
    if (!name || name.trim().length === 0) fail(`seviye ${level} adı boş.`);
    let cost = 0;
    let required = 1;
    if (level > 1) {
      const entry = config.upgradeCostByLevel[key];
      if (!entry || !Number.isInteger(entry.amount) || entry.amount <= 0) fail(`seviye ${level} bedeli eksik/geçersiz.`);
      if (entry!.currency !== 'money') fail(`seviye ${level} bedeli çip olmalı (elmas politikası).`);
      cost = entry!.amount;
      required = config.requiredPlayerLevelByLevel[key] ?? 0;
      if (!Number.isInteger(required) || required < 1 || required > maxPlayerLevel) {
        fail(`seviye ${level} oyuncu seviyesi şartı 1-${maxPlayerLevel} dışında.`);
      }
    }
    if (previous) {
      if (capacity! < previous.capacity) fail(`seviye ${level} kapasitesi bir öncekinden az.`);
      if (bonus! < previous.bonus) fail(`seviye ${level} konfor bonusu bir öncekinden az.`);
      if (level > 2 && cost < previous.cost) fail(`seviye ${level} bedeli bir öncekinden ucuz.`);
      if (level > 2 && required < previous.required) fail(`seviye ${level} oyuncu seviyesi şartı bir öncekinden düşük.`);
    }
    previous = { capacity: capacity!, cost, bonus: bonus!, required };
  }
}
