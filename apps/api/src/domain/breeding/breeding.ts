/**
 * Üreme (Breeding) akışı — docs/GENETICS.md §1 "Akış":
 * Mare + Stallion → Genetic Engine → Inherited Traits → Mutation →
 * Health Check → Foal. Bu dosya orkestrasyon katmanıdır; saf matematik
 * `genetics.ts`'te, soy ağacı/sağlık riski `pedigree.ts`'tedir.
 */

import { createSeededRandom } from '@at-sevdalisi/shared-types';
import type { GeneticsConfig, HorseGrowthConfig } from '@at-sevdalisi/game-config';
import type { HorseGender, HorseStatus, Pedigree } from '@at-sevdalisi/shared-types';
import {
  calculateChildPotential,
  calculateChildStat,
  calculateMutation,
  generateInheritanceSplit,
} from './genetics';
import {
  calculateBirthHealthRisk,
  calculateParentAgeFactor,
  calculateParentHealthFactor,
  checkInbreeding,
  createFoalPedigree,
} from './pedigree';
import { NotEligibleForBreedingError } from './errors';
import { generateBellCurveWeightKg, HORSE_WEIGHT_POPULATION_MEAN_KG } from '../horse/weight';

export interface BreedingCandidate {
  id: string;
  gender: 'mare' | 'stallion';
  status: HorseStatus;
  ageMonths: number;
  health: number;
  quality: number;
  potential: number;
  /** Kalıtsal statlar (HorseStats alanlarından oyuncunun seçtiği/tüm alt küme). Anahtar isimleri serbesttir. */
  stats: Record<string, number>;
  /**
   * `Horse.weightKg` (brief §7) — tayın ağırlığının kalıtım hesabında
   * kullanılan ham girdi (bkz. `breedHorses`'un `foalWeightKg` hesabı).
   * `null` OLABİLİR: bu değişiklikten ÖNCE oluşturulmuş, henüz `database/
   * migrations/0027_backfill_horse_weight_kg`'ın backfill'inden geçmemiş
   * teorik bir ebeveyn (ya da migration sırası nedeniyle) için gerçek bir
   * runtime guard'la ele alınır — `!` non-null assertion KULLANILMAZ,
   * yerine nüfus ortalaması (`HORSE_WEIGHT_POPULATION_MEAN_KG`) yedek
   * değer olarak kullanılır.
   */
  weightKg: number | null;
}

/**
 * Bir çiftin üremeye uygun olup olmadığını kontrol eder; uygun değilse
 * `NotEligibleForBreedingError` fırlatır (brief §28-29; yaş sınırları ve
 * cooldown proje-içi tasarım kararlarıdır, bkz. `genetics.config.json`).
 */
export function assertBreedingEligibility(
  mare: BreedingCandidate,
  stallion: BreedingCandidate,
  mareLastFoaledAt: Date | null,
  now: Date,
  config: GeneticsConfig,
): void {
  if (mare.id === stallion.id) {
    throw new NotEligibleForBreedingError('SAME_HORSE');
  }
  if (mare.gender !== 'mare' || stallion.gender !== 'stallion') {
    throw new NotEligibleForBreedingError('INVALID_GENDER');
  }
  if (mare.status !== 'active' || stallion.status !== 'active') {
    throw new NotEligibleForBreedingError('NOT_ACTIVE');
  }
  if (
    mare.ageMonths < config.minBreedingAgeMonths ||
    stallion.ageMonths < config.minBreedingAgeMonths
  ) {
    throw new NotEligibleForBreedingError('TOO_YOUNG');
  }
  if (
    mare.ageMonths > config.maxBreedingAgeMonths ||
    stallion.ageMonths > config.maxBreedingAgeMonths
  ) {
    throw new NotEligibleForBreedingError('TOO_OLD');
  }
  if (mareLastFoaledAt !== null) {
    const cooldownEndsAt = new Date(
      mareLastFoaledAt.getTime() + config.breedingCooldownDays * 24 * 60 * 60 * 1000,
    );
    if (now.getTime() < cooldownEndsAt.getTime()) {
      throw new NotEligibleForBreedingError('MARE_ON_COOLDOWN');
    }
  }
}

/** Damızlık ücreti = ((aygır kalitesi + potansiyeli) / 2) × `studFeeMultiplier` (brief §31 "Yetiştiricilik" gider kalemi). */
export function calculateStudFee(
  stallion: Pick<BreedingCandidate, 'quality' | 'potential'>,
  config: GeneticsConfig,
): number {
  return Math.round(((stallion.quality + stallion.potential) / 2) * config.studFeeMultiplier);
}

export interface BreedHorsesInput {
  foalId: string;
  mare: BreedingCandidate;
  stallion: BreedingCandidate;
  marePedigree: Pedigree | null;
  stallionPedigree: Pedigree | null;
  mareLastFoaledAt: Date | null;
  now: Date;
  /** Determinizm için (brief §18, GENETICS.md §8): aynı seed + aynı ebeveyn çifti → aynı sonuç. */
  seed: string;
  /**
   * 01.10.2026 — kısrak sahibinin üreme merkezi çarpanı
   * (`FarmEffects.birthHealthRiskMultiplier`, [0.5, 1]); verilmezse 1.
   * Formülün kendi çarpanlarını DEĞİŞTİRMEZ, sonuca ek bir çarpandır.
   */
  birthHealthRiskMultiplier?: number;
}

export interface BreedHorsesResult {
  foalStats: Record<string, number>;
  foalQuality: number;
  foalPotential: number;
  foalWeightKg: number;
  foalPedigree: Pedigree;
  birthHealthRisk: number;
  inbreedingDetected: boolean;
}

/**
 * Tay ağırlığı için kullanılan std sapma (kg) — nüfus genelinin std
 * sapmasından (`STARTER_HORSE_WEIGHT_STD_DEV_KG`, `domain/horse/horse.ts`,
 * ~25kg) BİLİNÇLİ olarak daha DAR: soy (pedigree), ebeveyn ortalamasının
 * etrafındaki doğal varyansı gerçek atçılıkta olduğu gibi DARALTIR (tay,
 * rastgele bir nüfus örneği değil, BELİRLİ iki ebeveynin çocuğudur).
 */
export const FOAL_WEIGHT_STD_DEV_KG = 15;

/**
 * Yeni doğan bir tayın cinsiyet havuzu — `gelding` BİLİNÇLİ OLARAK YOKTUR:
 * iğdişlik bir DOĞUM sonucu değil, sonradan yapılan bir müdahaledir
 * (`STARTER_HORSE_GENDERS`'tan farkı budur; o havuzda `gelding` meşrudur
 * çünkü başlangıç atı "yetişkin, hazır" bir attır).
 */
export const FOAL_GENDERS = ['mare', 'stallion'] as const;

/**
 * `[0, 1)` aralığındaki bir rastgelelik değerini tay cinsiyetine çevirir.
 * `pickStarterHorseName`/`pickStarterHorseGender` ile AYNI desen: SAF
 * fonksiyon, domain `Math.random()` ÇAĞIRMAZ (çağıran Application katmanı
 * üretip geçirir).
 */
export function pickFoalGender(randomValue: number): HorseGender {
  const index = Math.min(
    FOAL_GENDERS.length - 1,
    Math.max(0, Math.floor(randomValue * FOAL_GENDERS.length)),
  );
  return FOAL_GENDERS[index]!;
}

/**
 * `config/genetics.config.json`'ın çiftleştirmeyi SESSİZCE imkânsız hale
 * getirmediğini doğrular. `assertGiftConfigIsValid`/`assertTicketPriceIsValid`
 * ile AYNI ilke ve AYNI gerekçe: bu bir OPERATÖR hatasıdır, düz bir `Error`
 * ile yüzeye çıkar (400 değil) ve CI'da `breeding-config.spec.ts` ile de
 * yakalanır.
 *
 * NEDEN GEREKLİ: aşağıdaki bozuklukların hiçbiri bir istisna üretmez, hepsi
 * oyunu SESSİZCE kilitler:
 *  - `minBreedingAgeMonths > maxBreedingAgeMonths` → hiçbir at yaş aralığına
 *    giremez, `assertBreedingEligibility` her çifti `TOO_YOUNG` ya da
 *    `TOO_OLD` ile reddeder ve **çiftleştirme hiç çalışmaz**.
 *  - `breedingCooldownDays <= 0` → cooldown hiç uygulanmaz (tek bir kısrak
 *    aynı gün sınırsız tay doğurabilir; ekonomi ve genetik denge çöker).
 *  - `studFeeMultiplier` sonlu değilse → `calculateStudFee` `NaN` üretir,
 *    `NaN` `economy_transactions.amount`'a yazılamaz (`CHECK (amount <> 0)`
 *    ve `BIGINT` sütunu) ve para yolu ANLAŞILMAZ bir DB hatasıyla patlar.
 */
export function assertBreedingConfigIsValid(config: GeneticsConfig): void {
  const ages = [config.minBreedingAgeMonths, config.maxBreedingAgeMonths];
  if (ages.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error(
      `Üreme config'i geçersiz (config/genetics.config.json): minBreedingAgeMonths/maxBreedingAgeMonths pozitif tam sayı olmalıdır.`,
    );
  }
  if (config.minBreedingAgeMonths > config.maxBreedingAgeMonths) {
    throw new Error(
      `Üreme config'i geçersiz (config/genetics.config.json): minBreedingAgeMonths (${config.minBreedingAgeMonths}) maxBreedingAgeMonths (${config.maxBreedingAgeMonths}) değerinden büyük olamaz (hiçbir at üreyemez).`,
    );
  }
  if (!Number.isInteger(config.breedingCooldownDays) || config.breedingCooldownDays <= 0) {
    throw new Error(
      `Üreme config'i geçersiz (config/genetics.config.json): breedingCooldownDays pozitif tam sayı olmalıdır (aksi halde kısrak cooldown'ı hiç uygulanmaz).`,
    );
  }
  if (!Number.isFinite(config.studFeeMultiplier) || config.studFeeMultiplier < 0) {
    throw new Error(
      `Üreme config'i geçersiz (config/genetics.config.json): studFeeMultiplier negatif olmayan sonlu bir sayı olmalıdır (aksi halde damızlık ücreti NaN olur ve defter satırı yazılamaz).`,
    );
  }
}

/**
 * Tam üreme akışını çalıştırır (docs/GENETICS.md §1). `mare`/`stallion`
 * ve karşılık gelen `.stats` map'lerinin anahtarları birebir aynı
 * olmalıdır — her ortak anahtar için ayrı, bağımsız bir kalıtım/mutasyon
 * çekilişi yapılır (böylece tay bazı özelliklerde anneye, bazılarında
 * babaya daha yakın çıkabilir, GENETICS.md §3). `quality` de aynı şekilde
 * genel bir kalıtsal stat gibi işlenir; `potential` ise ayrı, üst sınırlı
 * bir formülle (GENETICS.md §5).
 *
 * `weightKg` (Carried Weight'in "at vücut ağırlığı" alt-faktörü, bkz.
 * `domain/race/carried-weight.ts`) GENETICS.md §3'ün genel kalıtım
 * formülünü KULLANMAZ (o formül 0-100 ölçekli statlar için `geneticsConfig`
 * ile ayarlanmıştır, kg cinsinden bir ölçek için uygun DEĞİLDİR) — bunun
 * yerine basit "ebeveyn ortalaması + dar bir varyans" yaklaşımı kullanılır
 * (bkz. `domain/horse/weight.ts` `generateBellCurveWeightKg`,
 * `FOAL_WEIGHT_STD_DEV_KG`).
 */
export function breedHorses(
  input: BreedHorsesInput,
  geneticsConfig: GeneticsConfig,
  growthConfig: HorseGrowthConfig,
): BreedHorsesResult {
  assertBreedingEligibility(
    input.mare,
    input.stallion,
    input.mareLastFoaledAt,
    input.now,
    geneticsConfig,
  );

  const rng = createSeededRandom(`${input.seed}:breeding:${input.mare.id}:${input.stallion.id}`);

  const foalStats: Record<string, number> = {};
  for (const statKey of Object.keys(input.mare.stats)) {
    const mareValue = input.mare.stats[statKey]!;
    const stallionValue = input.stallion.stats[statKey] ?? mareValue;
    const split = generateInheritanceSplit(rng, geneticsConfig);
    const mutation = calculateMutation(rng, geneticsConfig);
    foalStats[statKey] = calculateChildStat(mareValue, stallionValue, split, mutation);
  }

  const qualitySplit = generateInheritanceSplit(rng, geneticsConfig);
  const qualityMutation = calculateMutation(rng, geneticsConfig);
  const foalQuality = calculateChildStat(
    input.mare.quality,
    input.stallion.quality,
    qualitySplit,
    qualityMutation,
  );

  const potentialMutation = calculateMutation(rng, geneticsConfig);
  const foalPotential = calculateChildPotential(
    input.mare.potential,
    input.stallion.potential,
    potentialMutation,
    geneticsConfig,
  );

  // `weightKg` `null` olabilir (eski/legacy veri, backfill'den ÖNCEki
  // teorik bir ebeveyn) — bkz. `BreedingCandidate.weightKg` doc yorumu.
  // `!` KULLANILMAZ, GERÇEK bir runtime guard (`??`) ile nüfus ortalaması
  // yedek değer olarak kullanılır.
  const mareWeightKg = input.mare.weightKg ?? HORSE_WEIGHT_POPULATION_MEAN_KG;
  const stallionWeightKg = input.stallion.weightKg ?? HORSE_WEIGHT_POPULATION_MEAN_KG;
  const parentAverageWeightKg = (mareWeightKg + stallionWeightKg) / 2;
  const foalWeightKg = generateBellCurveWeightKg(
    [rng(), rng(), rng()],
    parentAverageWeightKg,
    FOAL_WEIGHT_STD_DEV_KG,
  );

  const inbreeding = checkInbreeding(
    input.mare.id,
    input.marePedigree,
    input.stallion.id,
    input.stallionPedigree,
    geneticsConfig,
  );
  const parentAgeFactor = calculateParentAgeFactor(
    input.mare.ageMonths,
    input.stallion.ageMonths,
    growthConfig,
    geneticsConfig,
  );
  const parentHealthFactor = calculateParentHealthFactor(
    input.mare.health,
    input.stallion.health,
    geneticsConfig,
  );
  const birthHealthRisk = Math.min(
    1,
    Math.max(
      0,
      calculateBirthHealthRisk(
        { parentAgeFactor, inbreedingFactor: inbreeding.factor, parentHealthFactor },
        geneticsConfig,
      ) * (input.birthHealthRiskMultiplier ?? 1),
    ),
  );

  const foalPedigree = createFoalPedigree(
    input.foalId,
    input.mare.id,
    input.marePedigree,
    input.stallion.id,
    input.stallionPedigree,
  );

  return {
    foalStats,
    foalQuality,
    foalPotential,
    foalWeightKg,
    foalPedigree,
    birthHealthRisk,
    inbreedingDetected: inbreeding.detected,
  };
}
