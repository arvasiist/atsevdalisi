import { describe, expect, it } from 'vitest';
import { applyEloUpdate, calculateExpectedScore } from '../../../src/domain/online/elo';
import onlineConfigJson from '../../../../../config/online.config.json';
import type { OnlineConfig } from '@at-sevdalisi/game-config';

const onlineConfig = onlineConfigJson as unknown as OnlineConfig;

describe('calculateExpectedScore', () => {
  it('eşit reytingde 0.5 döner', () => {
    expect(calculateExpectedScore(1000, 1000)).toBeCloseTo(0.5, 5);
  });

  it('daha yüksek reytingli oyuncu için 0.5\'ten büyük döner', () => {
    expect(calculateExpectedScore(1400, 1000)).toBeGreaterThan(0.5);
  });

  it('iki oyuncunun beklenen skorları toplamı 1 olur', () => {
    const expectedA = calculateExpectedScore(1200, 900);
    const expectedB = calculateExpectedScore(900, 1200);
    expect(expectedA + expectedB).toBeCloseTo(1, 5);
  });
});

describe('applyEloUpdate', () => {
  it('kazanan oyuncunun reytingi artar, kaybedenin azalır', () => {
    const result = applyEloUpdate(1000, 1000, 1, onlineConfig);
    expect(result.ratingA).toBeGreaterThan(1000);
    expect(result.ratingB).toBeLessThan(1000);
  });

  it('düşük reytingli oyuncu yüksek reytinglisine karşı kazanırsa büyük bir kazanç elde eder', () => {
    const upsetWin = applyEloUpdate(900, 1300, 1, onlineConfig);
    const expectedWin = applyEloUpdate(1300, 900, 1, onlineConfig);
    const upsetGain = upsetWin.ratingA - 900;
    const expectedGain = expectedWin.ratingA - 1300;
    expect(upsetGain).toBeGreaterThan(expectedGain);
  });

  it('reyting taban değerin altına düşemez', () => {
    const result = applyEloUpdate(onlineConfig.elo.minRating, 2000, 0, onlineConfig);
    expect(result.ratingA).toBeGreaterThanOrEqual(onlineConfig.elo.minRating);
  });

  it('berabere kalan eşit reytingli oyuncuların reytingi değişmez', () => {
    const result = applyEloUpdate(1000, 1000, 0.5, onlineConfig);
    expect(result.ratingA).toBe(1000);
    expect(result.ratingB).toBe(1000);
  });
});
