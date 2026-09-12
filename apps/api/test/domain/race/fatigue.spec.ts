import { describe, expect, it } from 'vitest';
import { accumulateRuntimeFatigue, deriveFatiguePerformancePenalty } from '../../../src/domain/race/fatigue';
import raceConfigJson from '../../../../../config/race.config.json';
import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';

const raceConfig = raceConfigJson as unknown as RaceBalanceConfig;

describe('accumulateRuntimeFatigue', () => {
  it('normal bir kararda (hold) her segmentte artar', () => {
    const next = accumulateRuntimeFatigue(0, 'hold', raceConfig.fatigue);
    expect(next).toBeGreaterThan(0);
  });

  it('reduce_pace kararı birikimi yavaşlatır', () => {
    const normal = accumulateRuntimeFatigue(0, 'hold', raceConfig.fatigue);
    const reduced = accumulateRuntimeFatigue(0, 'reduce_pace', raceConfig.fatigue);
    expect(reduced).toBeLessThan(normal);
  });

  it('maxRuntimeFatigue sınırını hiçbir zaman aşmaz', () => {
    let fatigue = 0;
    for (let i = 0; i < 100; i += 1) {
      fatigue = accumulateRuntimeFatigue(fatigue, 'hold', raceConfig.fatigue);
    }
    expect(fatigue).toBeLessThanOrEqual(raceConfig.fatigue.maxRuntimeFatigue);
  });

  it('0 altına inmez', () => {
    expect(accumulateRuntimeFatigue(0, 'reduce_pace', raceConfig.fatigue)).toBeGreaterThanOrEqual(0);
  });
});

describe('deriveFatiguePerformancePenalty', () => {
  it('yorgunluk 0 iken ceza 0 döner', () => {
    expect(deriveFatiguePerformancePenalty(0, raceConfig.fatigue)).toBe(0);
  });

  it('daha yüksek yorgunluk daha yüksek ceza verir', () => {
    const low = deriveFatiguePerformancePenalty(10, raceConfig.fatigue);
    const high = deriveFatiguePerformancePenalty(80, raceConfig.fatigue);
    expect(high).toBeGreaterThan(low);
  });
});
