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
import type { CareActionEffect, CareActionType, CareConfig, FeedType, FeedTypeEffect } from '@at-sevdalisi/game-config';
import { applyVitalDelta, type VitalSigns } from '../horse/vital-signs';
import { CareActionOnCooldownError, InvalidCareInputError } from './errors';

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

/**
 * FAZ 1 wiring, beşinci dilim (bkz. `errors.ts` `InvalidCareInputError`
 * üstündeki not — Antrenman dilimindeki Hata 7'nin dersi BAŞTAN
 * uygulanır): `config.actions[actionType]`/`config.feedTypes[feedType]`'a
 * yapılan HER erişim bu iki yardımcı üzerinden geçer, böylece tanımsız
 * bir değer sessizce `undefined` dönüp bir sonraki erişimde ham bir
 * `TypeError`e (500) yol açmak yerine burada net bir domain hatasına
 * dönüşür.
 */
function getCareActionEffect(config: CareConfig, actionType: CareActionType): CareActionEffect {
  const effect = config.actions[actionType];
  if (effect === undefined) {
    throw new InvalidCareInputError(`Geçersiz bakım eylemi: "${String(actionType)}".`);
  }
  return effect;
}

function getFeedTypeEffect(config: CareConfig, feedType: FeedType): FeedTypeEffect {
  const effect = config.feedTypes[feedType];
  if (effect === undefined) {
    throw new InvalidCareInputError(`Geçersiz yem türü: "${String(feedType)}".`);
  }
  return effect;
}

export function getCareActionCost(config: CareConfig, actionType: CareActionType) {
  return getCareActionEffect(config, actionType).cost;
}

export function getFeedCost(config: CareConfig, feedType: FeedType) {
  return getFeedTypeEffect(config, feedType).cost;
}

/**
 * AUDIT_REPORT.md H1 düzeltmesi (bu oturum) — bkz. `@at-sevdalisi/game-config`
 * `InjuryRecoveryConfig` üstündeki not. `postCareHealth`/`postCareVitalsHealth`
 * bakım eyleminin (delta'ları uygulanmış) SONUÇ değerleridir — kontrol,
 * eylemden ÖNCEKİ değil SONRAKİ duruma göre yapılır (ör. `vet`'in kendi
 * `injuryRiskDelta`'sı bu turda zaten düşürmüş olabilir).
 *
 * Yalnızca `config.injuryRecovery.action` ile eşleşen eylem türü için
 * `true` dönebilir — application katmanı bunu YALNIZCA at zaten
 * `injured` durumundaysa çağırmalıdır (aksi halde zaten `active`/`resting`
 * bir at için anlamsızdır).
 */
export function canRecoverFromInjury(
  config: CareConfig,
  actionType: CareActionType,
  postCareVitalsHealth: number,
  postCareInjuryRisk: number,
): boolean {
  const { injuryRecovery } = config;
  if (actionType !== injuryRecovery.action) {
    return false;
  }
  return postCareVitalsHealth >= injuryRecovery.minHealth && postCareInjuryRisk <= injuryRecovery.maxInjuryRisk;
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
  const effect = getCareActionEffect(config, actionType);
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
  const effect = getFeedTypeEffect(config, feedType);

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
