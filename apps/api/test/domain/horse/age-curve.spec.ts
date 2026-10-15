import { describe, expect, it } from 'vitest';
import {
  calculateAgeInMonths,
  computeHorseAgeMonths,
  gameMonthsToRealMs,
  getGrowthFactor,
  getLifeStage,
  horseAgeMonths,
  validateHorseGrowthConfig,
} from '../../../src/domain/horse/age-curve';
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

/**
 * 15.10.2026 — S5, sahibinin kararı: oyun yaşı hızlı akar (1 gerçek gün =
 * `gameMonthsPerRealDay` oyun ayı), `agingStartedAt` anındaki takvim yaşı korunur.
 */
describe('computeHorseAgeMonths (oyun yaşı)', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const start = new Date('2026-10-15T12:00:00Z');
  const birth48 = new Date('2022-10-15T00:00:00Z');

  it('gerçek config: 1 gerçek gün = 1 oyun ayı', () => {
    expect(config.gameMonthsPerRealDay).toBe(1);
    expect(validateHorseGrowthConfig(config)).toEqual([]);
  });

  it('çıpa anında takvim yaşıdır (mevcut atlar migration anındaki yaşını KORUR)', () => {
    expect(computeHorseAgeMonths({ birthDate: birth48, agingStartedAt: start }, start, config)).toBe(48);
  });

  it('her gerçek günde `gameMonthsPerRealDay` ay ilerler; tam gün dolmadan artmaz', () => {
    const anchor = { birthDate: birth48, agingStartedAt: start };
    expect(computeHorseAgeMonths(anchor, new Date(start.getTime() + DAY_MS - 1), config)).toBe(48);
    expect(computeHorseAgeMonths(anchor, new Date(start.getTime() + DAY_MS), config)).toBe(49);
    expect(computeHorseAgeMonths(anchor, new Date(start.getTime() + 30 * DAY_MS), config)).toBe(78);
    const doubled = { ...config, gameMonthsPerRealDay: 2 };
    expect(computeHorseAgeMonths(anchor, new Date(start.getTime() + 30 * DAY_MS), doubled)).toBe(108);
  });

  it('tay 0 aydan başlar; üreme yaşına (36) gerçek 36 günde ulaşır', () => {
    const foal = { birthDate: new Date('2026-10-15T00:00:00Z'), agingStartedAt: start };
    expect(computeHorseAgeMonths(foal, start, config)).toBe(0);
    expect(computeHorseAgeMonths(foal, new Date(start.getTime() + 36 * DAY_MS), config)).toBe(36);
  });

  it('saat çıpadan önceyse yaş düşmez', () => {
    expect(
      computeHorseAgeMonths({ birthDate: birth48, agingStartedAt: start }, new Date(start.getTime() - 10 * DAY_MS), config),
    ).toBe(48);
  });

  it('`Horse` kısayolu ISO metinleri aynı sonuca çevirir', () => {
    const now = new Date(start.getTime() + 5 * DAY_MS);
    expect(horseAgeMonths({ birthDate: birth48.toISOString(), agingStartedAt: start.toISOString() }, now, config)).toBe(
      computeHorseAgeMonths({ birthDate: birth48, agingStartedAt: start }, now, config),
    );
  });

  it('oyun ayı → gerçek süre çevirimi ölçeği tersine uygular', () => {
    expect(gameMonthsToRealMs(11, config)).toBe(11 * DAY_MS);
    expect(gameMonthsToRealMs(11, { ...config, gameMonthsPerRealDay: 2 })).toBe(5.5 * DAY_MS);
  });

  it('bozuk ölçek REDDEDİLİR (API açılmaz)', () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateHorseGrowthConfig({ ...config, gameMonthsPerRealDay: value })).not.toEqual([]);
    }
  });
});
