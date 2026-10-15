/**
 * YARIŞIN ATA BEDELİ + ZAMANLA TOPARLANMA (15.10.2026) —
 * `docs/OYUN_DONGUSU_DENETIMI.md` B2/B3, dilim S3.
 *
 * Ölçülen sorun: 12 ardışık pratik yarışta atın enerjisi 100, yorgunluğu 0
 * kaldı — yarış ata hiçbir şey yazmıyordu. Sonuç: sınırsız yarış, anlamsız
 * dinlenme ve yem kararı (yemin enerji etkisi boşa gidiyordu).
 *
 * Kural: yarış mesafeyle orantılı enerji yakar ve yorgunluk ekler; at zamanla
 * kendiliğinden toparlanır. Motor DEĞİŞMEDİ — motor yarış ÖNCESİ yorgunluğu
 * zaten okuyor (`preRaceFatigueFactor`), yani yorgun koşmak artık gerçek bir
 * bedel: "hemen tekrar koş ya da dinlendir" kararı doğar.
 */

import type { CareConfig, RaceBalanceConfig } from '@at-sevdalisi/game-config';
import type { HorseStatus } from '@at-sevdalisi/shared-types';
import type { VitalSigns } from '../horse/vital-signs';
import { checkRaceReadiness } from '../race/readiness';

export const VITAL_MIN = 0;
export const VITAL_MAX = 100;
const METERS_PER_KM = 1000;
const SECONDS_PER_HOUR = 3600;
const MS_PER_SECOND = 1000;

/** `horses.energy/fatigue` NUMERIC(5,2) — Postgres da iki haneye yuvarlar. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampVital(value: number): number {
  return Math.min(VITAL_MAX, Math.max(VITAL_MIN, value));
}

export interface RaceConditionCost {
  energy: number;
  fatigue: number;
}

export function computeRaceConditionCost(
  distanceMeters: number,
  config: CareConfig['raceCondition'],
): RaceConditionCost {
  const km = Math.max(0, distanceMeters) / METERS_PER_KM;
  return { energy: round2(km * config.energyPerKm), fatigue: round2(km * config.fatiguePerKm) };
}

export type RaceConditionVitals = Pick<VitalSigns, 'energy' | 'fatigue'>;

export function applyRaceConditionCost(vitals: RaceConditionVitals, cost: RaceConditionCost): RaceConditionVitals {
  return {
    energy: clampVital(round2(vitals.energy - cost.energy)),
    fatigue: clampVital(round2(vitals.fatigue + cost.fatigue)),
  };
}

/** Bir turun saydığı süre: negatif olamaz, `maxCreditSeconds`i aşamaz. */
export function creditedRecoverySeconds(elapsedSeconds: number, config: CareConfig['passiveRecovery']): number {
  return Math.min(config.maxCreditSeconds, Math.max(0, elapsedSeconds));
}

export function applyPassiveRecovery(
  vitals: RaceConditionVitals,
  elapsedSeconds: number,
  config: CareConfig['passiveRecovery'],
): RaceConditionVitals {
  const hours = creditedRecoverySeconds(elapsedSeconds, config) / SECONDS_PER_HOUR;
  return {
    energy: clampVital(round2(vitals.energy + config.energyPerHour * hours)),
    fatigue: clampVital(round2(vitals.fatigue - config.fatiguePerHour * hours)),
  };
}

/** Tahminin bakacağı en uzak gelecek — bu sürede hazır olmayan at "zamanla geçmez" sayılır. */
const MAX_ESTIMATE_SECONDS = 7 * 24 * SECONDS_PER_HOUR;

/**
 * Atın yarışa ne zaman hazır olacağı (yalnızca yorgunluk/enerji engeliyse).
 * `null`: zaten hazır YA DA engel zamanla geçmez (durum, sağlık) YA DA
 * toparlanma kapalı. Zamanlayıcının turları TEK TEK taklit edilir: veritabanı
 * her turdan sonra iki haneye yuvarlar ve düz çizgi hesabı bir tur erken
 * "hazır" derdi (yaşandı: 6 turda 75 → 70,02, kapı 70).
 */
export function estimateRaceReadyAt(
  status: HorseStatus,
  vitals: VitalSigns,
  thresholds: RaceBalanceConfig['readiness'],
  config: CareConfig['passiveRecovery'],
  now: Date,
): Date | null {
  const readiness = checkRaceReadiness(status, vitals, thresholds);
  if (readiness.ready || !config.enabled) return null;
  if (readiness.reason !== 'HORSE_TOO_TIRED' && readiness.reason !== 'INSUFFICIENT_ENERGY') return null;
  let state: RaceConditionVitals = { energy: vitals.energy, fatigue: vitals.fatigue };
  for (let seconds = config.tickSeconds; seconds <= MAX_ESTIMATE_SECONDS; seconds += config.tickSeconds) {
    state = applyPassiveRecovery(state, config.tickSeconds, config);
    if (checkRaceReadiness(status, { ...vitals, ...state }, thresholds).ready) {
      return new Date(now.getTime() + seconds * MS_PER_SECOND);
    }
  }
  return null;
}

/** API açılışında koşar — bozuk ayarla API AÇILMAZ. */
export function validateRaceConditionConfig(care: CareConfig): string[] {
  const problems: string[] = [];
  const { raceCondition, passiveRecovery } = care;
  if (!(raceCondition.energyPerKm >= 0 && raceCondition.fatiguePerKm >= 0)) {
    problems.push('raceCondition: energyPerKm ve fatiguePerKm ≥ 0 olmalı.');
  }
  if (!(Number.isInteger(passiveRecovery.tickSeconds) && passiveRecovery.tickSeconds > 0)) {
    problems.push('passiveRecovery.tickSeconds > 0 tam sayı olmalı.');
  }
  if (!(passiveRecovery.maxCreditSeconds >= passiveRecovery.tickSeconds)) {
    problems.push('passiveRecovery.maxCreditSeconds ≥ tickSeconds olmalı (yoksa her tur süre kaybeder).');
  }
  if (!(passiveRecovery.energyPerHour >= 0 && passiveRecovery.fatiguePerHour >= 0)) {
    problems.push('passiveRecovery: energyPerHour ve fatiguePerHour ≥ 0 olmalı.');
  }
  return problems;
}
