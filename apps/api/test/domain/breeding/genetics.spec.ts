import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '@at-sevdalisi/shared-types';
import {
  calculateChildPotential,
  calculateChildStat,
  calculateMutation,
  generateInheritanceSplit,
} from '../../../src/domain/breeding/genetics';
import geneticsConfigJson from '../../../../../config/genetics.config.json';
import type { GeneticsConfig } from '@at-sevdalisi/game-config';

const config = geneticsConfigJson as unknown as GeneticsConfig;

/** docs/GENETICS.md §3, docs/ALGORITHMS.md §10. */
describe('generateInheritanceSplit', () => {
  it('aynı seed aynı split üretir (determinism)', () => {
    const splitA = generateInheritanceSplit(createSeededRandom('seed-x'), config);
    const splitB = generateInheritanceSplit(createSeededRandom('seed-x'), config);
    expect(splitA).toEqual(splitB);
  });

  it('inheritanceA config aralığında, inheritanceB = 1 - inheritanceA', () => {
    const split = generateInheritanceSplit(createSeededRandom('any-seed'), config);
    expect(split.inheritanceA).toBeGreaterThanOrEqual(config.inheritanceRange[0]);
    expect(split.inheritanceA).toBeLessThanOrEqual(config.inheritanceRange[1]);
    expect(split.inheritanceA + split.inheritanceB).toBeCloseTo(1);
  });
});

/** docs/GENETICS.md §4. */
describe('calculateMutation', () => {
  it('1000 denemede hiçbir mutasyon config sınırlarını aşmaz', () => {
    for (let i = 0; i < 1000; i += 1) {
      const mutation = calculateMutation(createSeededRandom(`mutation-${i}`), config);
      expect(mutation).toBeGreaterThanOrEqual(config.mutationBounds[0]);
      expect(mutation).toBeLessThanOrEqual(config.mutationBounds[1]);
    }
  });
});

describe('calculateChildStat', () => {
  it('sonucu [0, 100] aralığına sınırlar (mutasyon dahil aşırı uçlarda bile)', () => {
    expect(calculateChildStat(100, 100, { inheritanceA: 0.5, inheritanceB: 0.5 }, 3)).toBe(100);
    expect(calculateChildStat(0, 0, { inheritanceA: 0.5, inheritanceB: 0.5 }, -3)).toBe(0);
  });

  it('ebeveyn ağırlıklı ortalamasını + mutasyonu doğru hesaplar', () => {
    const result = calculateChildStat(80, 60, { inheritanceA: 0.6, inheritanceB: 0.4 }, 1);
    expect(result).toBeCloseTo(80 * 0.6 + 60 * 0.4 + 1);
  });
});

/** docs/GENETICS.md §5 — üst sınır: average(parents) × maxPotentialGainOverParents. */
describe('calculateChildPotential', () => {
  it('1000 denemede childPotential hiçbir zaman üst sınırı aşmaz', () => {
    const cap = ((80 + 90) / 2) * config.maxPotentialGainOverParents;
    for (let i = 0; i < 1000; i += 1) {
      const mutation = calculateMutation(createSeededRandom(`potential-${i}`), config);
      const childPotential = calculateChildPotential(80, 90, mutation, config);
      expect(childPotential).toBeLessThanOrEqual(cap + 1e-9);
      expect(childPotential).toBeGreaterThanOrEqual(0);
      expect(childPotential).toBeLessThanOrEqual(100);
    }
  });
});
