import { describe, expect, it } from 'vitest';
import { breedHorses, calculateStudFee, type BreedHorsesInput, type BreedingCandidate } from '../../../src/domain/breeding/breeding';
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
});

describe('calculateStudFee', () => {
  it('aygırın kalite+potansiyel ortalamasına göre ücret hesaplar', () => {
    const fee = calculateStudFee(stallion, geneticsConfig);
    expect(fee).toBe(Math.round(((stallion.quality + stallion.potential) / 2) * geneticsConfig.studFeeMultiplier));
    expect(fee).toBeGreaterThan(0);
  });
});
