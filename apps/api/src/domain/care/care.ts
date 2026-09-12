/**
 * Bakım sistemi (brief §11): Tımar (groom), Su (water), Temizlik (clean),
 * Veteriner (vet), Nalbant (farrier), Dinlendir (rest) + Beslenme (brief §12).
 *
 * Fonksiyonlar saftır; DB/zaman erişimi yoktur (`now`/`lastPerformedAt`
 * çağıran taraftan parametre olarak gelir, brief Kural: domain framework'süz).
 *
 * Not (dokümantasyon amaçlı eşleme — brief'te tanımlanan ama şemada ayrı bir
 * alanı olmayan kavramlar mevcut `HorseHealth` alanlarına eşlenir):
 *  - Nalbant'ın "hoof condition / running stability" etkisi → `jointCondition`.
 *  - Temizlik'in "infection risk" azaltımı → `injuryRisk` azaltımı (proxy).
 */

import { clamp } from '@at-sevdalisi/shared-types';
import type { CareActionType, CareConfig, FeedType } from '@at-sevdalisi/game-config';
import { applyVitalDelta, type VitalSigns } from '../horse/vital-signs';
import { CareActionOnCooldownError } from './errors';

/** `HorseHealth`'in bakım eylemlerinden etkilenen alt kümesi. */
export interface CareableHealth {
  injuryRisk: number;
  recoveryRate: number;
  jointCondition: number;
  weightCondition: number;
}

export interface CareActionResult {
  vitals: VitalSigns;
  health: CareableHealth;
}

const MIN_VALUE = 0;
const MAX_VALUE = 100;

/** Bir bakım eyleminin ne zaman tekrar kullanılabileceğini kontrol eder. */
export function canPerformCareAction(
  lastPerformedAt: Date | null,
  now: Date,
  cooldownMinutes: number,
): { allowed: boolean; remainingMinutes: number } {
  if (lastPerformedAt === null) {
    return { allowed: true, remainingMinutes: 0 };
  }
  const elapsedMinutes = (now.getTime() - lastPerformedAt.getTime()) / (1000 * 60);
  const remaining = cooldownMinutes - elapsedMinutes;
  return remaining <= 0 ? { allowed: true, remainingMinutes: 0 } : { allowed: false, remainingMinutes: Math.ceil(remaining) };
}

export function getCareActionCost(config: CareConfig, actionType: CareActionType) {
  return config.actions[actionType].cost;
}

export function getFeedCost(config: CareConfig, feedType: FeedType) {
  return config.feedTypes[feedType].cost;
}

/**
 * Bir bakım eylemini uygular. Cooldown dolmamışsa `CareActionOnCooldownError`
 * fırlatır — application layer bu eylemi hiç oluşturmamalı/ücretlendirmemelidir.
 */
export function applyCareAction(
  config: CareConfig,
  actionType: CareActionType,
  vitals: VitalSigns,
  health: CareableHealth,
  lastPerformedAt: Date | null,
  now: Date = new Date(),
): CareActionResult {
  const effect = config.actions[actionType];
  const readiness = canPerformCareAction(lastPerformedAt, now, effect.cooldownMinutes);
  if (!readiness.allowed) {
    throw new CareActionOnCooldownError(readiness.remainingMinutes);
  }

  return {
    vitals: applyVitalDelta(vitals, effect.vitalDelta ?? {}),
    health: {
      injuryRisk: clamp(health.injuryRisk + (effect.injuryRiskDelta ?? 0), MIN_VALUE, MAX_VALUE),
      recoveryRate: clamp(health.recoveryRate + (effect.recoveryRateDelta ?? 0), MIN_VALUE, MAX_VALUE),
      jointCondition: clamp(health.jointCondition + (effect.jointConditionDelta ?? 0), MIN_VALUE, MAX_VALUE),
      weightCondition: health.weightCondition,
    },
  };
}

/**
 * Yem verir (brief §12: besin türüne göre farklı etkiler; "daha pahalı yem
 * = daha iyi" garantisi YOKTUR — örn. `performance` yemi energy'yi çok
 * artırır ama `weightCondition`'ı düşürür).
 */
export function applyFeed(
  config: CareConfig,
  feedType: FeedType,
  vitals: VitalSigns,
  health: CareableHealth,
): CareActionResult {
  const effect = config.feedTypes[feedType];

  return {
    vitals: applyVitalDelta(vitals, effect.vitalDelta ?? {}),
    health: {
      injuryRisk: health.injuryRisk,
      recoveryRate: clamp(health.recoveryRate + (effect.recoveryRateDelta ?? 0), MIN_VALUE, MAX_VALUE),
      jointCondition: health.jointCondition,
      weightCondition: clamp(health.weightCondition + (effect.weightConditionDelta ?? 0), MIN_VALUE, MAX_VALUE),
    },
  };
}
