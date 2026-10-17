import { createSeededRandom } from '@at-sevdalisi/shared-types';
import type { GeneticsConfig } from '@at-sevdalisi/game-config';
import { calculateStudFee } from './breeding';

/**
 * 16.10.2026 — ÇİFTLEŞTİRME MERKEZİ + DOĞURGANLIK + GEBELİK (brief §4–§5).
 * Saf kurallar: I/O yok, `Math.random` yok (rastgelelik çağırandan gelir).
 *
 * Akış: aygır sahibi ilan verir (kendi ücreti, formül ücretinin sınırları
 * içinde) → kısrak sahibi teklif gönderir (ücret EMANETE alınır) → aygır sahibi
 * kabul eder ya da reddeder (ret/iptal/süre dolumu = TAM iade) → kabulde
 * döllenme zarı (olasılık < 1) → tutarsa gebelik (`gestationDurationMs`), tutmazsa
 * `failedConceptionRefundPercent` iadesi → doğumu zamanlayıcı yapar.
 */

const FERTILITY_MIN = 0;
const FERTILITY_MAX = 100;
const NEUTRAL_FERTILITY = 50;
const FULL_HEALTH = 100;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const PERCENT = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Yeni atın doğurganlığı: kimlikten determinist `base ± spread` (kişilik ile aynı desen). */
export function deriveFertility(horseId: string, config: GeneticsConfig): number {
  const rng = createSeededRandom(`${horseId}:fertility`);
  const { base, spread } = config.fertility;
  return clamp(Math.round(base + (rng() * 2 - 1) * spread), FERTILITY_MIN, FERTILITY_MAX);
}

/** Tayın doğurganlığı: ebeveyn ortalaması ± mutasyon (`rng` genetik tohumundan). */
export function inheritFertility(
  mareFertility: number,
  stallionFertility: number,
  rng: () => number,
  config: GeneticsConfig,
): number {
  const average = (mareFertility + stallionFertility) / 2;
  const mutation = (rng() * 2 - 1) * config.fertility.inheritanceMutation;
  return clamp(Math.round(average + mutation), FERTILITY_MIN, FERTILITY_MAX);
}

export interface ConceptionInput {
  mareFertility: number;
  stallionFertility: number;
  mareHealth: number;
  /** Kısrağın yaş evresi adı (`horse-growth` → `stages[].name`). */
  mareLifeStage: string;
}

/** Döllenme olasılığı (0..1, uçlar hariç; config sınırlarına kırpılır). */
export function computeConceptionChance(input: ConceptionInput, config: GeneticsConfig): number {
  const rules = config.conception;
  const averageFertility = (input.mareFertility + input.stallionFertility) / 2;
  const chance =
    rules.baseChance +
    ((averageFertility - NEUTRAL_FERTILITY) / NEUTRAL_FERTILITY) * rules.fertilityWeight +
    ((clamp(input.mareHealth, 0, FULL_HEALTH) - FULL_HEALTH) / FULL_HEALTH) * rules.healthWeight -
    (rules.ageStagePenalty[input.mareLifeStage] ?? 0);
  // Dört ondalık: `breeding_attempts.chance NUMERIC(5,4)` ile aynı hassasiyet.
  return Math.round(clamp(chance, rules.minChance, rules.maxChance) * 10_000) / 10_000;
}

/** Zar `roll` ∈ [0,1): `roll < chance` döllenme demektir. */
export function isConceived(roll: number, chance: number): boolean {
  return roll < chance;
}

/** Gebelik süresi (gerçek ms): `realWorldDays × timeScale` gün. */
export function gestationDurationMs(config: GeneticsConfig): number {
  return Math.round(config.gestation.realWorldDays * config.gestation.timeScale * MS_PER_DAY);
}

export function expectedBirthAt(conceivedAt: Date, config: GeneticsConfig): Date {
  return new Date(conceivedAt.getTime() + gestationDurationMs(config));
}

/** Başarısız denemeden sonra kısrağın yeniden denenebileceği an (yoksa `null`). */
export function failedAttemptRestEndsAt(lastFailedAt: Date | null, config: GeneticsConfig): Date | null {
  if (lastFailedAt === null) return null;
  return new Date(lastFailedAt.getTime() + config.conception.failedAttemptCooldownHours * MS_PER_HOUR);
}

// ---------------------------------------------------------------------------
// Gebelik bakımı + doğum riski
// ---------------------------------------------------------------------------

export interface PregnancyCareInput {
  conceivedAt: Date;
  /** Değerlendirme anı (doğumda doğum anı; ekranda "şimdi", doğumdan sonra değil). */
  at: Date;
  checkupCount: number;
  /** Gebelik içinde kısrağın beslendiği ayrı gün sayısı. */
  fedDays: number;
}

export interface PregnancyCareScore {
  /** 0..1 — yapılan veteriner kontrolü / beklenen kontrol. */
  care: number;
  /** 0..1 — beslenen gün / geçen gün. */
  nutrition: number;
  expectedCheckups: number;
  elapsedDays: number;
}

export function computePregnancyCare(input: PregnancyCareInput, config: GeneticsConfig): PregnancyCareScore {
  const elapsedMs = Math.max(0, input.at.getTime() - input.conceivedAt.getTime());
  const intervalMs = config.pregnancyCare.checkupIntervalHours * MS_PER_HOUR;
  // İlk kontrol gebeliğin başında beklenir; sonra her aralıkta bir.
  const expectedCheckups = Math.max(1, Math.ceil(elapsedMs / intervalMs));
  const elapsedDays = Math.max(1, Math.ceil(elapsedMs / MS_PER_DAY));
  return {
    care: clamp(input.checkupCount / expectedCheckups, 0, 1),
    nutrition: clamp(input.fedDays / elapsedDays, 0, 1),
    expectedCheckups,
    elapsedDays,
  };
}

/** Bakım puanının doğum riskine çarpanı: tam bakım `min`, hiç bakım `max`. */
export function pregnancyRiskMultiplier(score: Pick<PregnancyCareScore, 'care' | 'nutrition'>, config: GeneticsConfig): number {
  const rules = config.pregnancyCare;
  const weighted = rules.careWeight * score.care + rules.nutritionWeight * score.nutrition;
  return rules.maxRiskMultiplier - (rules.maxRiskMultiplier - rules.minRiskMultiplier) * clamp(weighted, 0, 1);
}

export interface BirthOutcome {
  /** 0..1 — `horse_health.injury_risk` = × 100. */
  birthRisk: number;
  /** Tayın doğum sağlığı (0..100). */
  foalHealth: number;
}

export function computeBirthOutcome(baseRisk: number, multiplier: number, config: GeneticsConfig): BirthOutcome {
  const birthRisk = clamp(baseRisk * multiplier, 0, 1);
  return {
    birthRisk: Math.round(birthRisk * 10_000) / 10_000,
    foalHealth: clamp(Math.round(FULL_HEALTH - birthRisk * config.pregnancyCare.healthPenaltyAtFullRisk), 0, FULL_HEALTH),
  };
}

export type PregnancyRiskLevel = 'low' | 'medium' | 'high';

export function pregnancyRiskLevel(projectedRisk: number, config: GeneticsConfig): PregnancyRiskLevel {
  const levels = config.pregnancyCare.riskLevels;
  if (projectedRisk >= levels.high) return 'high';
  if (projectedRisk >= levels.medium) return 'medium';
  return 'low';
}

/** Bir sonraki veteriner kontrolünün açılacağı an (`null` = şimdi yapılabilir). */
export function nextCheckupAvailableAt(lastCheckupAt: Date | null, now: Date, config: GeneticsConfig): Date | null {
  if (lastCheckupAt === null) return null;
  const next = new Date(lastCheckupAt.getTime() + config.pregnancyCare.checkupIntervalHours * MS_PER_HOUR);
  return next.getTime() > now.getTime() ? next : null;
}

// ---------------------------------------------------------------------------
// İlan ücreti + teklif
// ---------------------------------------------------------------------------

export interface StudFeeBounds {
  /** Formül ücreti (`calculateStudFee`) — ekranda "önerilen". */
  suggested: number;
  min: number;
  max: number;
}

export function studFeeBounds(
  stallion: { quality: number; potential: number },
  config: GeneticsConfig,
): StudFeeBounds {
  const suggested = calculateStudFee(stallion, config);
  return {
    suggested,
    min: Math.ceil(suggested * config.breedingCenter.minFeeFactor),
    max: Math.floor(suggested * config.breedingCenter.maxFeeFactor),
  };
}

export function isStudFeeWithinBounds(fee: unknown, bounds: StudFeeBounds): fee is number {
  return typeof fee === 'number' && Number.isInteger(fee) && fee >= bounds.min && fee <= bounds.max;
}

export const BREEDING_OFFER_STATUSES = ['pending', 'accepted', 'rejected', 'cancelled', 'expired'] as const;
export type BreedingOfferStatus = (typeof BREEDING_OFFER_STATUSES)[number];

/** Döllenme tutmazsa kısrak sahibine dönen tutar (aşağı yuvarlanır). */
export function failedConceptionRefund(fee: number, config: GeneticsConfig): number {
  return Math.floor((fee * config.breedingCenter.failedConceptionRefundPercent) / PERCENT);
}

export function offerExpiresAt(createdAt: Date, config: GeneticsConfig): Date {
  return new Date(createdAt.getTime() + config.breedingCenter.offerExpiryHours * MS_PER_HOUR);
}

// ---------------------------------------------------------------------------
// Config doğrulaması (API açılışında + testte)
// ---------------------------------------------------------------------------

export function validateBreedingCenterConfig(config: GeneticsConfig): void {
  const fail = (message: string): never => {
    throw new Error(`Çiftleştirme merkezi config'i geçersiz (config/genetics.config.json): ${message}`);
  };
  const { fertility, conception, gestation, pregnancyCare, breedingCenter } = config;
  if (!fertility || !conception || !gestation || !pregnancyCare || !breedingCenter) {
    fail('fertility/conception/gestation/pregnancyCare/breedingCenter bölümleri zorunlu.');
  }
  if (fertility.base - fertility.spread < FERTILITY_MIN || fertility.base + fertility.spread > FERTILITY_MAX) {
    fail('fertility.base ± spread 0..100 içinde kalmalı.');
  }
  if (!(conception.minChance > 0 && conception.minChance <= conception.maxChance && conception.maxChance < 1)) {
    fail('conception: 0 < minChance ≤ maxChance < 1 olmalı (döllenme hiçbir zaman kesin değildir).');
  }
  if (!(conception.failedAttemptCooldownHours > 0)) {
    fail('conception.failedAttemptCooldownHours > 0 olmalı (yoksa başarısız deneme sınırsız tekrarlanır).');
  }
  if (!(gestation.realWorldDays > 0 && gestation.timeScale > 0 && gestation.timeScale <= 1)) {
    fail('gestation: realWorldDays > 0 ve 0 < timeScale ≤ 1 olmalı.');
  }
  if (!(pregnancyCare.minRiskMultiplier > 0 && pregnancyCare.minRiskMultiplier <= pregnancyCare.maxRiskMultiplier)) {
    fail('pregnancyCare: 0 < minRiskMultiplier ≤ maxRiskMultiplier olmalı.');
  }
  if (Math.abs(pregnancyCare.careWeight + pregnancyCare.nutritionWeight - 1) > 1e-9) {
    fail('pregnancyCare.careWeight + nutritionWeight = 1 olmalı.');
  }
  if (!(pregnancyCare.checkupCost >= 0 && Number.isInteger(pregnancyCare.checkupCost) && pregnancyCare.checkupIntervalHours > 0)) {
    fail('pregnancyCare.checkupCost tam sayı ≥ 0 ve checkupIntervalHours > 0 olmalı.');
  }
  if (!(pregnancyCare.riskLevels.medium < pregnancyCare.riskLevels.high)) {
    fail('pregnancyCare.riskLevels.medium < high olmalı.');
  }
  if (!(breedingCenter.minFeeFactor > 0 && breedingCenter.minFeeFactor <= 1 && breedingCenter.maxFeeFactor >= 1)) {
    fail('breedingCenter: 0 < minFeeFactor ≤ 1 ≤ maxFeeFactor olmalı.');
  }
  const refund = breedingCenter.failedConceptionRefundPercent;
  if (!(Number.isInteger(refund) && refund >= 0 && refund <= PERCENT)) {
    fail('breedingCenter.failedConceptionRefundPercent 0..100 tam sayı olmalı (100 üstü para basardı).');
  }
  if (!(breedingCenter.offerExpiryHours > 0 && breedingCenter.historyLimit > 0 && breedingCenter.scheduler.batchSize > 0)) {
    fail('breedingCenter.offerExpiryHours, historyLimit ve scheduler.batchSize > 0 olmalı.');
  }
}
