/**
 * JOKEY DURUMU (08.10.2026) — form + yorgunluk. Saf; veritabanı yok.
 *
 * Önceden jokeyin kendi durumu modellenmiyordu (PROJE_DURUMU "Jokey
 * yorgunluğu/sakatlığı yok"). SAYAÇ TUTULMAZ: girdi, kadro dondurulurken
 * `race_entries`ten okunan son binişlerdir (`JockeyRepository.findRideHistory`)
 * — ikinci bir doğruluk kaynağı yok, sonuç her zaman binişlerle tutarlı.
 *
 *   form      = son `formSampleSize` binişin sıra yüzdeliği ortalaması
 *               (birinci 100, sonuncu 0; tek atlık yarış 100). `formMinRides`
 *               altında form NÖTR (50) ve etiket `unknown`.
 *   formÇarpan = 1 + formInfluence × (form − 50) / 50
 *   yorgunluk = son `fatigueWindowHours` saatteki biniş; `freeRidesInWindow`
 *               üstündeki her biniş `fatiguePenaltyPerRide` düşürür, tavan
 *               `maxFatiguePenalty`. Zaman geçtikçe kendiliğinden düşer.
 *
 * MOTORA DOKUNULMAZ: çarpan `effectiveJockeySkill` içinde beceriye uygulanır
 * ve dondurulmuş kadroya (`jockeySkillComposite`) yazılır — uyum (`compatibility
 * Influence`) ile AYNI desen. Eski kadrolar ve tekrar oynatma değişmez.
 */

import type { JockeyConditionConfig } from '@at-sevdalisi/game-config';
import { clamp, type JockeyConditionView, type JockeyFormLabel } from '@at-sevdalisi/shared-types';

export interface JockeyRidePlacement {
  finishPosition: number;
  fieldSize: number;
}

export interface JockeyRideHistory {
  /** En yeniden eskiye; en fazla `formSampleSize`. */
  recentPlacements: JockeyRidePlacement[];
  ridesInWindow: number;
}

const NEUTRAL_FORM = 50;
const MAX_FORM = 100;
const PERCENT = 100;

/** Sıra yüzdeliği: birinci 100, sonuncu 0. Geçersiz satır sayılmaz. */
export function placementPercentile(placement: JockeyRidePlacement): number | null {
  const { finishPosition, fieldSize } = placement;
  if (!Number.isInteger(finishPosition) || !Number.isInteger(fieldSize) || fieldSize < 1) return null;
  if (finishPosition < 1 || finishPosition > fieldSize) return null;
  if (fieldSize === 1) return MAX_FORM;
  return ((fieldSize - finishPosition) / (fieldSize - 1)) * MAX_FORM;
}

export function formLabel(score: number | null, config: JockeyConditionConfig): JockeyFormLabel {
  if (score === null) return 'unknown';
  const { hot, good, poor, cold } = config.formBands;
  if (score >= hot) return 'hot';
  if (score >= good) return 'good';
  if (score <= cold) return 'cold';
  if (score <= poor) return 'poor';
  return 'average';
}

export function computeJockeyCondition(history: JockeyRideHistory, config: JockeyConditionConfig): JockeyConditionView {
  const percentiles = history.recentPlacements
    .slice(0, config.formSampleSize)
    .map(placementPercentile)
    .filter((value): value is number => value !== null);
  const formScore =
    percentiles.length >= config.formMinRides
      ? percentiles.reduce((sum, value) => sum + value, 0) / percentiles.length
      : null;
  const formMultiplier = 1 + (config.formInfluence * ((formScore ?? NEUTRAL_FORM) - NEUTRAL_FORM)) / NEUTRAL_FORM;

  const rides = Math.max(0, Math.floor(history.ridesInWindow));
  const extraRides = Math.max(0, rides - config.freeRidesInWindow);
  const fatiguePenalty = clamp(extraRides * config.fatiguePenaltyPerRide, 0, config.maxFatiguePenalty);
  const multiplier = formMultiplier * (1 - fatiguePenalty);

  return {
    form: formLabel(formScore, config),
    formRides: percentiles.length,
    formPercent: roundPercent((formMultiplier - 1) * PERCENT),
    ridesInWindow: rides,
    fatigueWindowHours: config.fatigueWindowHours,
    freeRidesInWindow: config.freeRidesInWindow,
    fatiguePercent: roundPercent(fatiguePenalty * PERCENT),
    multiplier,
  };
}

/** Gösterim yüzdesi 1 ondalık; çarpanın kendisi yuvarlanmaz. */
const PERCENT_DECIMAL_SCALE = 10;

function roundPercent(value: number): number {
  return Math.round(value * PERCENT_DECIMAL_SCALE) / PERCENT_DECIMAL_SCALE;
}

/** API açılışında: bozuk config durumu sessizce saçmalatmasın. */
export function validateJockeyConditionConfig(config: JockeyConditionConfig): string[] {
  const problems: string[] = [];
  if (!(Number.isInteger(config.formSampleSize) && config.formSampleSize >= 1)) problems.push('formSampleSize ≥ 1 tam sayı olmalı.');
  if (!(Number.isInteger(config.formMinRides) && config.formMinRides >= 1 && config.formMinRides <= config.formSampleSize)) {
    problems.push('formMinRides 1..formSampleSize arasında olmalı.');
  }
  if (!(config.formInfluence >= 0 && config.formInfluence < 1)) problems.push('formInfluence 0 ≤ x < 1 olmalı.');
  const { hot, good, poor, cold } = config.formBands;
  if (!(MAX_FORM >= hot && hot > good && good > NEUTRAL_FORM && NEUTRAL_FORM > poor && poor > cold && cold >= 0)) {
    problems.push('formBands: 100 ≥ hot > good > 50 > poor > cold ≥ 0 olmalı.');
  }
  if (!(config.fatigueWindowHours > 0)) problems.push('fatigueWindowHours > 0 olmalı.');
  if (!(Number.isInteger(config.freeRidesInWindow) && config.freeRidesInWindow >= 0)) problems.push('freeRidesInWindow ≥ 0 tam sayı olmalı.');
  if (!(config.fatiguePenaltyPerRide >= 0)) problems.push('fatiguePenaltyPerRide ≥ 0 olmalı.');
  if (!(config.maxFatiguePenalty >= 0 && config.maxFatiguePenalty < 1)) problems.push('maxFatiguePenalty 0 ≤ x < 1 olmalı.');
  return problems;
}
