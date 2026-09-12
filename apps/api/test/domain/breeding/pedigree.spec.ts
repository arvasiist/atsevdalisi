import { describe, expect, it } from 'vitest';
import {
  calculateBirthHealthRisk,
  calculateParentAgeFactor,
  calculateParentHealthFactor,
  checkInbreeding,
  collectKnownAncestorIds,
  createFoalPedigree,
} from '../../../src/domain/breeding/pedigree';
import geneticsConfigJson from '../../../../../config/genetics.config.json';
import horseGrowthConfigJson from '../../../../../config/horse-growth.config.json';
import type { GeneticsConfig, HorseGrowthConfig } from '@at-sevdalisi/game-config';
import type { Pedigree } from '@at-sevdalisi/shared-types';

const geneticsConfig = geneticsConfigJson as unknown as GeneticsConfig;
const growthConfig = horseGrowthConfigJson as unknown as HorseGrowthConfig;

const marePedigree: Pedigree = { horseId: 'mare-1', sireId: 'grandpa-1', damId: 'grandma-1', grandSireId: 'gg1', grandDamId: 'gg2', bloodline: 'Anka Hattı' };

describe('collectKnownAncestorIds', () => {
  it('atın kendisi + soy ağacındaki tüm bilinen ataları döner', () => {
    const ids = collectKnownAncestorIds('mare-1', marePedigree);
    expect(ids).toEqual(new Set(['mare-1', 'grandpa-1', 'grandma-1', 'gg1', 'gg2']));
  });

  it('pedigree null ise sadece atın kendisini döner', () => {
    expect(collectKnownAncestorIds('x', null)).toEqual(new Set(['x']));
  });
});

/** docs/GENETICS.md §6 — brief'te açıkça yazılmamış ama gerekli görülen kontrol. */
describe('checkInbreeding', () => {
  it('ortak ata yoksa detected: false, factor: 1.0 döner', () => {
    const unrelated: Pedigree = { horseId: 'stallion-1', sireId: 'other-1', damId: 'other-2', grandSireId: 'other-3', grandDamId: 'other-4', bloodline: null };
    const result = checkInbreeding('mare-1', marePedigree, 'stallion-1', unrelated, geneticsConfig);
    expect(result.detected).toBe(false);
    expect(result.factor).toBe(1.0);
  });

  it('ortak ata varsa detected: true, factor: config.inbreedingRiskMultiplier döner', () => {
    const related: Pedigree = { horseId: 'stallion-2', sireId: 'grandpa-1', damId: 'other-5', grandSireId: null, grandDamId: null, bloodline: null };
    const result = checkInbreeding('mare-1', marePedigree, 'stallion-2', related, geneticsConfig);
    expect(result.detected).toBe(true);
    expect(result.sharedAncestorIds).toEqual(['grandpa-1']);
    expect(result.factor).toBe(geneticsConfig.inbreedingRiskMultiplier);
  });
});

/** docs/GENETICS.md §6 parent_age_factor. */
describe('calculateParentAgeFactor', () => {
  it('prime çağdaki ebeveynler için en düşük risk çarpanını verir', () => {
    const primeFactor = calculateParentAgeFactor(48, 48, growthConfig, geneticsConfig);
    const oldFactor = calculateParentAgeFactor(150, 150, growthConfig, geneticsConfig);
    const youngFactor = calculateParentAgeFactor(6, 6, growthConfig, geneticsConfig);
    expect(oldFactor).toBeGreaterThan(primeFactor);
    expect(youngFactor).toBeGreaterThan(primeFactor);
  });
});

describe('calculateParentHealthFactor', () => {
  it('düşük ortalama sağlık daha yüksek risk çarpanı verir', () => {
    expect(calculateParentHealthFactor(30, 30, geneticsConfig)).toBeGreaterThan(calculateParentHealthFactor(95, 95, geneticsConfig));
  });
});

/** docs/GENETICS.md §6 birth_health_risk = base × age × inbreeding × health. */
describe('calculateBirthHealthRisk', () => {
  it('tüm çarpanlar nötr (1) ise sonuç base_risk\'e eşittir', () => {
    const risk = calculateBirthHealthRisk({ parentAgeFactor: 1, inbreedingFactor: 1, parentHealthFactor: 1 }, geneticsConfig);
    expect(risk).toBe(geneticsConfig.baseBirthHealthRisk);
  });

  it('sonuç her zaman [0, 1] aralığına sınırlanır', () => {
    const risk = calculateBirthHealthRisk({ parentAgeFactor: 10, inbreedingFactor: 10, parentHealthFactor: 10 }, geneticsConfig);
    expect(risk).toBeLessThanOrEqual(1);
    expect(risk).toBeGreaterThanOrEqual(0);
  });
});

describe('createFoalPedigree', () => {
  it('sire/dam doğru atanır; grandSire = aygırın babası, grandDam = kısrağın annesi', () => {
    const stallionPedigree: Pedigree = { horseId: 'stallion-1', sireId: 'other-1', damId: 'other-2', grandSireId: 'other-3', grandDamId: 'other-4', bloodline: null };
    const foalPedigree = createFoalPedigree('foal-1', 'mare-1', marePedigree, 'stallion-1', stallionPedigree);
    expect(foalPedigree.sireId).toBe('stallion-1');
    expect(foalPedigree.damId).toBe('mare-1');
    expect(foalPedigree.grandSireId).toBe('other-1');
    expect(foalPedigree.grandDamId).toBe('grandma-1');
  });

  it('bloodline önce aygırdan, yoksa kısraktan devralınır', () => {
    const stallionWithBloodline: Pedigree = { ...marePedigree, horseId: 's', bloodline: 'Aygır Hattı' };
    expect(createFoalPedigree('f', 'mare-1', marePedigree, 's', stallionWithBloodline).bloodline).toBe('Aygır Hattı');

    const stallionWithoutBloodline: Pedigree = { ...marePedigree, horseId: 's', bloodline: null };
    expect(createFoalPedigree('f', 'mare-1', marePedigree, 's', stallionWithoutBloodline).bloodline).toBe('Anka Hattı');
  });
});
