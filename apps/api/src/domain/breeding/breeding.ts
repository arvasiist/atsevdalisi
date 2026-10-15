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
import { gameMonthsToRealMs } from '../horse/age-curve';

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
  /**
   * 15.10.2026 — atın ömrü boyunca verdiği tay sayısı (kısrak: anne, aygır:
   * baba olduğu `breeding_pairs`). SAYAÇ TUTULMAZ, çift kayıtlarından kilit
   * altında sayılır.
   */
  foalCount: number;
}

/** Üreme yaşı aralığında mı (`[minBreedingAgeMonths, maxBreedingAgeMonths]`, oyun ayı). */
export function isWithinBreedingAge(ageMonths: number, config: GeneticsConfig): boolean {
  return ageMonths >= config.minBreedingAgeMonths && ageMonths <= config.maxBreedingAgeMonths;
}

/** Atın cinsiyetine göre ömür boyu tay sınırı (`genetics.lifetimeFoalLimit`). */
export function lifetimeFoalLimitFor(gender: 'mare' | 'stallion', config: GeneticsConfig): number {
  return config.lifetimeFoalLimit[gender];
}

/**
 * Bir çiftin üremeye uygun olup olmadığını kontrol eder; uygun değilse
 * `NotEligibleForBreedingError` fırlatır (brief §28-29; yaş sınırları ve
 * cooldown proje-içi tasarım kararlarıdır, bkz. `genetics.config.json`).
 * Sıra sabittir, ilk uyan neden döner.
 *
 * 15.10.2026 — S5, sahibinin kararı: iki ebeveyn de EMEKLİ olmalı (eskiden
 * `active` şartı vardı: at aynı anda hem yarışıp hem damızlık yapıyordu) ve
 * her atın ömür boyu tay sınırı vardır. Kısrak beklemesi OYUN AYIdır
 * (`breedingCooldownMonths`, gerçek süre `gameMonthsPerRealDay` ile).
 */
export function assertBreedingEligibility(
  mare: BreedingCandidate,
  stallion: BreedingCandidate,
  mareLastFoaledAt: Date | null,
  now: Date,
  config: GeneticsConfig,
  growthConfig: HorseGrowthConfig,
): void {
  if (mare.id === stallion.id) {
    throw new NotEligibleForBreedingError('SAME_HORSE');
  }
  if (mare.gender !== 'mare' || stallion.gender !== 'stallion') {
    throw new NotEligibleForBreedingError('INVALID_GENDER');
  }
  if (mare.status !== 'retired' || stallion.status !== 'retired') {
    throw new NotEligibleForBreedingError('NOT_RETIRED');
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
  if (
    mare.foalCount >= lifetimeFoalLimitFor('mare', config) ||
    stallion.foalCount >= lifetimeFoalLimitFor('stallion', config)
  ) {
    throw new NotEligibleForBreedingError('FOAL_LIMIT_REACHED');
  }
  if (mareLastFoaledAt !== null) {
    const cooldownEndsAt = new Date(
      mareLastFoaledAt.getTime() + gameMonthsToRealMs(config.breedingCooldownMonths, growthConfig),
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

/**
 * 15.10.2026 — S5 (B10): damızlık ücretinin aygır sahibine geçen kısmı. Kalan
 * (`100 − studFeeOwnerSharePercent`) ekonomiden ÇIKAR — yan hesaplar arası değer
 * aktarımını pahalılaştırır (tribün hediyesiyle aynı desen). Aşağı yuvarlanır.
 */
export function studFeeOwnerShare(fee: number, config: GeneticsConfig): number {
  return Math.floor((fee * config.studFeeOwnerSharePercent) / 100);
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
 *  - `breedingCooldownMonths <= 0` → cooldown hiç uygulanmaz (tek bir kısrak
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
  if (!Number.isInteger(config.breedingCooldownMonths) || config.breedingCooldownMonths <= 0) {
    throw new Error(
      `Üreme config'i geçersiz (config/genetics.config.json): breedingCooldownMonths pozitif tam sayı olmalıdır (aksi halde kısrak cooldown'ı hiç uygulanmaz).`,
    );
  }
  const limits = config.lifetimeFoalLimit;
  if (!limits || ![limits.mare, limits.stallion].every((value) => Number.isInteger(value) && value > 0)) {
    throw new Error(
      `Üreme config'i geçersiz (config/genetics.config.json): lifetimeFoalLimit.mare/stallion pozitif tam sayı olmalıdır (0 hiçbir atı ürettirmez, eksik değer sınırı kapatırdı).`,
    );
  }
  const share = config.studFeeOwnerSharePercent;
  if (!Number.isInteger(share) || share < 0 || share > 100) {
    throw new Error(
      `Üreme config'i geçersiz (config/genetics.config.json): studFeeOwnerSharePercent 0..100 arası tam sayı olmalıdır (100'ü aşması para basardı).`,
    );
  }
  const market = config.studMarket;
  if (
    !market ||
    !Number.isInteger(market.listLimit) ||
    !Number.isInteger(market.scanLimit) ||
    market.listLimit <= 0 ||
    market.scanLimit < market.listLimit
  ) {
    throw new Error(
      `Üreme config'i geçersiz (config/genetics.config.json): studMarket.listLimit > 0 ve scanLimit ≥ listLimit tam sayı olmalıdır.`,
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
    growthConfig,
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
