import { describe, expect, it } from 'vitest';
import { calculateAgeInMonths, getGrowthFactor, getLifeStage } from '../../../src/domain/horse/age-curve';
import growthConfig from '../../../../../config/horse-growth.config.json';
import type { HorseGrowthConfig } from '@at-sevdalisi/game-config';

const config = growthConfig as unknown as HorseGrowthConfig;

describe('getLifeStage', () => {
  it('her yaş aralığı için doğru evreyi döner', () => {
    expect(getLifeStage(6, config).name).toBe('foal');
    expect(getLifeStage(24, config).name).toBe('development');
    expect(getLifeStage(50, config).name).toBe('prime');
    expect(getLifeStage(100, config).name).toBe('mature');
    expect(getLifeStage(200, config).name).toBe('aging');
  });
});

describe('getGrowthFactor', () => {
  it('prime evrede growthFactor 1.0 döner', () => {
    expect(getGrowthFactor(50, config)).toBe(1.0);
  });
});

describe('calculateAgeInMonths', () => {
  it('doğum tarihinden şimdiye kadarki ay sayısını doğru hesaplar', () => {
    const age = calculateAgeInMonths(new Date('2022-03-14'), new Date('2026-09-12'));
    // 2022-03-14 -> 2026-09-12: 4 yıl 5 ay tam, ama gün henüz 14'e ulaşmadığı için 1 ay eksik.
    expect(age).toBe(53);
  });

  it('gelecekteki/negatif yaş üretmez', () => {
    const age = calculateAgeInMonths(new Date('2026-09-12'), new Date('2026-09-12'));
    expect(age).toBe(0);
  });
});
