import { describe, expect, it } from 'vitest';
import {
  assertCanAddHorseToStable,
  canAddHorseToStable,
  getStableCapacity,
  summarizeStable,
} from '../../../src/domain/stable/stable';
import { StableCapacityExceededError } from '../../../src/domain/stable/errors';
import stableConfigJson from '../../../../../config/stable.config.json';
import type { StableConfig } from '@at-sevdalisi/game-config';

const config = stableConfigJson as unknown as StableConfig;

/** brief §32 (temel kapasite), §38-39 (Ahır Özeti / Ahır Ekranı) testleri. */
describe('getStableCapacity', () => {
  it('tanımlı seviyeler için doğru kapasiteyi döner', () => {
    expect(getStableCapacity(1, config)).toBe(5);
    expect(getStableCapacity(2, config)).toBe(8);
    expect(getStableCapacity(3, config)).toBe(12);
  });

  it('tanımsız üst seviye için en yüksek tanımlı seviyenin kapasitesine düşer', () => {
    expect(getStableCapacity(5, config)).toBe(12);
  });

  it('tanımsız alt seviye için en düşük tanımlı seviyenin kapasitesine düşer', () => {
    expect(getStableCapacity(0, config)).toBe(5);
  });
});

describe('canAddHorseToStable / assertCanAddHorseToStable', () => {
  it('kapasite dolmadan true döner', () => {
    expect(canAddHorseToStable(4, 5)).toBe(true);
  });

  it('kapasite dolunca false döner ve assert versiyonu hata fırlatır', () => {
    expect(canAddHorseToStable(5, 5)).toBe(false);
    expect(() => assertCanAddHorseToStable(5, 5)).toThrow(StableCapacityExceededError);
  });
});

describe('summarizeStable', () => {
  it('at sayısı, ortalama kondisyon ve sağlık uyarılarını doğru hesaplar', () => {
    const summary = summarizeStable(
      [
        { name: 'Şimşek', health: 90, fitness: 80 },
        { name: 'Kara Yel', health: 40, fitness: 60 },
      ],
      5,
      config,
    );
    expect(summary.horseCount).toBe(2);
    expect(summary.capacity).toBe(5);
    expect(summary.averageCondition).toBe((85 + 50) / 2);
    expect(summary.healthWarnings).toEqual(['Kara Yel']);
  });

  it('boş ahır için sıfır/boş değerler döner', () => {
    const summary = summarizeStable([], 5, config);
    expect(summary.averageCondition).toBe(0);
    expect(summary.healthWarnings).toEqual([]);
  });
});
