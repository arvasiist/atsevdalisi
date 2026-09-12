/**
 * At durum değerleri (brief §9): health, fitness, fatigue, energy, morale.
 * Bu değerler brief'in açıkça belirttiği gibi BİRBİRİNİN YERİNE KULLANILMAZ
 * — her biri ayrı bir anlam taşır ve ayrı ayrı güncellenir.
 */

import { clamp } from '@at-sevdalisi/shared-types';

export interface VitalSigns {
  health: number;
  fitness: number;
  fatigue: number;
  energy: number;
  morale: number;
}

export type VitalSignsDelta = Partial<Record<keyof VitalSigns, number>>;

/**
 * Bir dizi delta'yı (antrenman, bakım, dinlenme vb. sonucu oluşan
 * değişimleri) uygular ve her değeri [0, 100] aralığına sınırlar.
 * Saf fonksiyondur; girdi nesnesini değiştirmez.
 */
export function applyVitalDelta(vitals: VitalSigns, delta: VitalSignsDelta): VitalSigns {
  return {
    health: clamp(vitals.health + (delta.health ?? 0), 0, 100),
    fitness: clamp(vitals.fitness + (delta.fitness ?? 0), 0, 100),
    fatigue: clamp(vitals.fatigue + (delta.fatigue ?? 0), 0, 100),
    energy: clamp(vitals.energy + (delta.energy ?? 0), 0, 100),
    morale: clamp(vitals.morale + (delta.morale ?? 0), 0, 100),
  };
}

export interface TrainingReadinessThresholds {
  minEnergyToTrain: number;
  maxFatigueToTrain: number;
}

export interface TrainingReadiness {
  ready: boolean;
  reason: 'INSUFFICIENT_ENERGY' | 'HORSE_TOO_TIRED' | null;
}

/**
 * Atın antrenmana/yarışa hazır olup olmadığını kontrol eder (brief §75
 * MVP kriteri: "Antrenman stat/fatigue etkisi oluşturuyor" — buna girmeden
 * önce hazır olma kontrolü gerekir). Eşik değerler config'den gelir,
 * kodda sabit tutulmaz (brief Kural 6/7).
 */
export function checkTrainingReadiness(
  vitals: VitalSigns,
  thresholds: TrainingReadinessThresholds,
): TrainingReadiness {
  if (vitals.energy < thresholds.minEnergyToTrain) {
    return { ready: false, reason: 'INSUFFICIENT_ENERGY' };
  }
  if (vitals.fatigue > thresholds.maxFatigueToTrain) {
    return { ready: false, reason: 'HORSE_TOO_TIRED' };
  }
  return { ready: true, reason: null };
}
