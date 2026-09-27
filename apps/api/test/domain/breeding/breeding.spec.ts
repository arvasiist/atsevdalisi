import { describe, expect, it } from 'vitest';
import {
  assertBreedingConfigIsValid,
  breedHorses,
  calculateStudFee,
  FOAL_GENDERS,
  FOAL_WEIGHT_STD_DEV_KG,
  pickFoalGender,
  type BreedHorsesInput,
  type BreedingCandidate,
} from '../../../src/domain/breeding/breeding';
import { HORSE_WEIGHT_MAX_KG, HORSE_WEIGHT_MIN_KG, HORSE_WEIGHT_POPULATION_MEAN_KG } from '../../../src/domain/horse/weight';
import { NotEligibleForBreedingError } from '../../../src/domain/breeding/errors';
import geneticsConfigJson from '../../../../../config/genetics.config.json';
import horseGrowthConfigJson from '../../../../../config/horse-growth.config.json';
import type { GeneticsConfig, HorseGrowthConfig } from '@at-sevdalisi/game-config';

const geneticsConfig = geneticsConfigJson as unknown as GeneticsConfig;
const growthConfig = horseGrowthConfigJson as unknown as HorseGrowthConfig;

const now = new Date('2026-06-01T00:00:00Z');

const mare: BreedingCandidate = {
  id: 'mare-1',
  gender: 'mare',
  status: 'active',
  ageMonths: 60,
  health: 90,
  quality: 70,
  potential: 75,
  stats: { speed: 70, stamina: 65, acceleration: 60 },
  weightKg: 470,
};

const stallion: BreedingCandidate = {
  id: 'stallion-1',
  gender: 'stallion',
  status: 'active',
  ageMonths: 72,
  health: 85,
  quality: 80,
  potential: 85,
  stats: { speed: 85, stamina: 75, acceleration: 70 },
  weightKg: 530,
};

const baseInput: BreedHorsesInput = {
  foalId: 'foal-1',
  mare,
  stallion,
  marePedigree: null,
  stallionPedigree: null,
  mareLastFoaledAt: null,
  now,
  seed: 'race-server-seed-42',
};

/** docs/GENETICS.md §1 Akış — tam üreme akışı. */
describe('breedHorses', () => {
  it('aynı seed + aynı ebeveyn çifti her zaman aynı tay sonucunu üretir (determinism, brief §18)', () => {
    const resultA = breedHorses(baseInput, geneticsConfig, growthConfig);
    const resultB = breedHorses({ ...baseInput }, geneticsConfig, growthConfig);
    expect(resultA).toEqual(resultB);
  });

  it('farklı seed farklı bir sonuç üretir', () => {
    const resultA = breedHorses(baseInput, geneticsConfig, growthConfig);
    const resultC = breedHorses({ ...baseInput, seed: 'different-seed' }, geneticsConfig, growthConfig);
    expect(resultA.foalStats).not.toEqual(resultC.foalStats);
  });

  it('her tay statı, ebeveyn aralığı + mutasyon payı içinde kalır', () => {
    const result = breedHorses(baseInput, geneticsConfig, growthConfig);
    for (const key of Object.keys(mare.stats)) {
      const mareVal = mare.stats[key]!;
      const stallionVal = stallion.stats[key]!;
      const min = Math.min(mareVal, stallionVal) + geneticsConfig.mutationBounds[0];
      const max = Math.max(mareVal, stallionVal) + geneticsConfig.mutationBounds[1];
      expect(result.foalStats[key]).toBeGreaterThanOrEqual(min - 1e-9);
      expect(result.foalStats[key]).toBeLessThanOrEqual(max + 1e-9);
    }
  });

  it('tayın potansiyeli ebeveyn ortalamasının üst sınırını asla aşmaz', () => {
    const result = breedHorses(baseInput, geneticsConfig, growthConfig);
    const cap = ((mare.potential + stallion.potential) / 2) * geneticsConfig.maxPotentialGainOverParents;
    expect(result.foalPotential).toBeLessThanOrEqual(cap + 1e-9);
  });

  it('soy kaydını doğru oluşturur ve birthHealthRisk [0,1] aralığındadır', () => {
    const result = breedHorses(baseInput, geneticsConfig, growthConfig);
    expect(result.foalPedigree.sireId).toBe('stallion-1');
    expect(result.foalPedigree.damId).toBe('mare-1');
    expect(result.inbreedingDetected).toBe(false);
    expect(result.birthHealthRisk).toBeGreaterThanOrEqual(0);
    expect(result.birthHealthRisk).toBeLessThanOrEqual(1);
  });

  it('ortak ataya sahip bir çift için inbreeding tespit eder ve riski artırır', () => {
    const shared = { horseId: 'x', sireId: 'common-ancestor', damId: null, grandSireId: null, grandDamId: null, bloodline: null };
    const normal = breedHorses(baseInput, geneticsConfig, growthConfig);
    const inbred = breedHorses(
      { ...baseInput, foalId: 'foal-inbred', marePedigree: shared, stallionPedigree: { ...shared, horseId: 'y' } },
      geneticsConfig,
      growthConfig,
    );
    expect(inbred.inbreedingDetected).toBe(true);
    expect(inbred.birthHealthRisk).toBeGreaterThan(normal.birthHealthRisk);
  });

  it.each([
    ['TOO_YOUNG', { ...mare, ageMonths: 10 }, stallion],
    ['INVALID_GENDER', mare, { ...stallion, gender: 'mare' as const }],
  ])('uygun olmayan çift için %s hatası fırlatır', (reason, testMare, testStallion) => {
    let thrown: unknown;
    try {
      breedHorses({ ...baseInput, mare: testMare, stallion: testStallion }, geneticsConfig, growthConfig);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(NotEligibleForBreedingError);
    expect((thrown as InstanceType<typeof NotEligibleForBreedingError>).reason).toBe(reason);
  });

  it('kısrak cooldown süresindeyse hata fırlatır', () => {
    const recentFoaling = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 gün önce, cooldown 180 gün
    expect(() => breedHorses({ ...baseInput, mareLastFoaledAt: recentFoaling }, geneticsConfig, growthConfig)).toThrow(
      NotEligibleForBreedingError,
    );
  });

  it('cooldown süresi geçtiyse tekrar üremeye izin verir', () => {
    const oldFoaling = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000); // 200 gün önce, cooldown 180 gün
    expect(() => breedHorses({ ...baseInput, mareLastFoaledAt: oldFoaling }, geneticsConfig, growthConfig)).not.toThrow();
  });

  /** R4 — Carried Weight, tay ağırlığı kalıtımı (bu turda EKLENDİ). */
  describe('foalWeightKg', () => {
    it('[430, 580] aralığının dışına ASLA çıkmaz (clamp)', () => {
      const result = breedHorses(baseInput, geneticsConfig, growthConfig);
      expect(result.foalWeightKg).toBeGreaterThanOrEqual(HORSE_WEIGHT_MIN_KG);
      expect(result.foalWeightKg).toBeLessThanOrEqual(HORSE_WEIGHT_MAX_KG);
    });

    it('ebeveyn ortalamasının (500kg) makul bir std sapma aralığında kalır', () => {
      const result = breedHorses(baseInput, geneticsConfig, growthConfig);
      // `mare.weightKg`/`stallion.weightKg` yukarıdaki fixture'da sabit 470/530
      // (bilinen, non-null literal test değerleri) — `!` non-null assertion
      // GEREKMEDEN doğrudan bu bilinen değerler kullanılır.
      const parentAverage = (470 + 530) / 2; // 500
      // Bates(3) dağılımı [meanKg - stdDevKg*3, meanKg + stdDevKg*3] pratik aralığının DIŞINA neredeyse hiç çıkmaz.
      expect(result.foalWeightKg).toBeGreaterThanOrEqual(parentAverage - FOAL_WEIGHT_STD_DEV_KG * 3);
      expect(result.foalWeightKg).toBeLessThanOrEqual(parentAverage + FOAL_WEIGHT_STD_DEV_KG * 3);
    });

    it('bir ebeveynin weightKg değeri null ise (eski/legacy veri) nüfus ortalamasını (495kg) yedek değer olarak kullanır (! non-null assertion kullanılmadan gerçek bir guard ile)', () => {
      const mareWithNullWeight: BreedingCandidate = { ...mare, weightKg: null };
      const result = breedHorses({ ...baseInput, mare: mareWithNullWeight }, geneticsConfig, growthConfig);
      const expectedParentAverage = (HORSE_WEIGHT_POPULATION_MEAN_KG + 530) / 2;
      expect(result.foalWeightKg).toBeGreaterThanOrEqual(expectedParentAverage - FOAL_WEIGHT_STD_DEV_KG * 3);
      expect(result.foalWeightKg).toBeLessThanOrEqual(expectedParentAverage + FOAL_WEIGHT_STD_DEV_KG * 3);
    });

    it('aynı seed + aynı ebeveyn çifti her zaman aynı foalWeightKg üretir (determinism)', () => {
      const resultA = breedHorses(baseInput, geneticsConfig, growthConfig);
      const resultB = breedHorses({ ...baseInput }, geneticsConfig, growthConfig);
      expect(resultA.foalWeightKg).toBe(resultB.foalWeightKg);
    });

    it('farklı seed farklı bir foalWeightKg üretebilir (sabit/mock bir değer DEĞİL)', () => {
      const results = new Set(
        ['seed-a', 'seed-b', 'seed-c', 'seed-d', 'seed-e'].map(
          (seed) => breedHorses({ ...baseInput, seed }, geneticsConfig, growthConfig).foalWeightKg,
        ),
      );
      expect(results.size).toBeGreaterThan(1);
    });
  });
});

describe('calculateStudFee', () => {
  it('aygırın kalite+potansiyel ortalamasına göre ücret hesaplar', () => {
    const fee = calculateStudFee(stallion, geneticsConfig);
    expect(fee).toBe(Math.round(((stallion.quality + stallion.potential) / 2) * geneticsConfig.studFeeMultiplier));
    expect(fee).toBeGreaterThan(0);
  });
});

/**
 * `pickFoalGender` — çiftleştirme diliminde EKLENDİ. `pickStarterHorseGender`
 * ile AYNI desen: saf fonksiyon, rastgelelik Application katmanından gelir.
 */
describe('pickFoalGender', () => {
  it('havuzda YALNIZCA mare ve stallion vardır — gelding bir DOĞUM sonucu DEĞİLDİR', () => {
    expect(FOAL_GENDERS).toEqual(['mare', 'stallion']);
    const produced = new Set(Array.from({ length: 200 }, (_, i) => pickFoalGender(i / 200)));
    expect(produced).toEqual(new Set(['mare', 'stallion']));
  });

  it('[0, 0.5) → mare, [0.5, 1) → stallion', () => {
    expect(pickFoalGender(0)).toBe('mare');
    expect(pickFoalGender(0.499)).toBe('mare');
    expect(pickFoalGender(0.5)).toBe('stallion');
    expect(pickFoalGender(0.999)).toBe('stallion');
  });

  it('aralık dışı değerler TAŞMAZ (Math.random() sözleşmesi [0,1) ama savunma amaçlı)', () => {
    expect(pickFoalGender(1)).toBe('stallion');
    expect(pickFoalGender(99)).toBe('stallion');
    expect(pickFoalGender(-1)).toBe('mare');
  });
});

/**
 * `assertBreedingConfigIsValid` — bu dilimde EKLENDİ. `assertGiftConfigIsValid`
 * ile AYNI amaç: bozuk bir config'in oyunu SESSİZCE kilitlemesini (ya da
 * cooldown'ı sessizce kapatmasını) bir OPERATÖR hatasına çevirmek.
 */
describe('assertBreedingConfigIsValid', () => {
  it('config/genetics.config.json geçerlidir (gerçek config sessizce kilitli değil)', () => {
    expect(() => assertBreedingConfigIsValid(geneticsConfig)).not.toThrow();
  });

  it('minBreedingAgeMonths > maxBreedingAgeMonths ise fırlatır (hiçbir at üreyemezdi)', () => {
    expect(() =>
      assertBreedingConfigIsValid({ ...geneticsConfig, minBreedingAgeMonths: 200, maxBreedingAgeMonths: 100 }),
    ).toThrow(/minBreedingAgeMonths/);
  });

  it.each([0, -1, 1.5])('breedingCooldownDays = %s ise fırlatır (cooldown sessizce kapanırdı)', (value) => {
    expect(() => assertBreedingConfigIsValid({ ...geneticsConfig, breedingCooldownDays: value })).toThrow(
      /breedingCooldownDays/,
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'studFeeMultiplier = %s ise fırlatır (damızlık ücreti NaN olur, defter satırı yazılamazdı)',
    (value) => {
      expect(() => assertBreedingConfigIsValid({ ...geneticsConfig, studFeeMultiplier: value })).toThrow(
        /studFeeMultiplier/,
      );
    },
  );
});
