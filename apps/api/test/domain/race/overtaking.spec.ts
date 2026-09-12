import { describe, expect, it } from 'vitest';
import {
  assignInitialLane,
  calculateAvailableSpace,
  calculateOvertakeProbability,
  deriveLaneChange,
  type OvertakeAttemptInput,
} from '../../../src/domain/race/overtaking';
import raceConfigJson from '../../../../../config/race.config.json';
import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';

const raceConfig = raceConfigJson as unknown as RaceBalanceConfig;

function baseAttempt(overrides: Partial<OvertakeAttemptInput> = {}): OvertakeAttemptInput {
  return {
    attackerAcceleration: 70,
    attackerJockeySkill: 65,
    attackerRiskLevel: 'normal',
    speedDifference: 0,
    availableSpace: 60,
    defenderBlockBonus: 0,
    ...overrides,
  };
}

/** brief §21 overtake_probability. */
describe('calculateOvertakeProbability', () => {
  it('[0,1] aralığında bir olasılık döner', () => {
    const p = calculateOvertakeProbability(baseAttempt(), raceConfig.overtaking);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('daha yüksek ivme, geçiş olasılığını artırır', () => {
    const low = calculateOvertakeProbability(baseAttempt({ attackerAcceleration: 40 }), raceConfig.overtaking);
    const high = calculateOvertakeProbability(baseAttempt({ attackerAcceleration: 95 }), raceConfig.overtaking);
    expect(high).toBeGreaterThan(low);
  });

  it('pozitif speedDifference (saldıran daha hızlı) olasılığı artırır', () => {
    const behind = calculateOvertakeProbability(baseAttempt({ speedDifference: -10 }), raceConfig.overtaking);
    const ahead = calculateOvertakeProbability(baseAttempt({ speedDifference: 10 }), raceConfig.overtaking);
    expect(ahead).toBeGreaterThan(behind);
  });

  it('daha fazla boşluk (availableSpace) olasılığı artırır', () => {
    const crowded = calculateOvertakeProbability(baseAttempt({ availableSpace: 10 }), raceConfig.overtaking);
    const open = calculateOvertakeProbability(baseAttempt({ availableSpace: 100 }), raceConfig.overtaking);
    expect(open).toBeGreaterThan(crowded);
  });

  it('yüksek risk seviyesi (daha cesur), düşük risk seviyesinden daha yüksek olasılık verir', () => {
    const low = calculateOvertakeProbability(baseAttempt({ attackerRiskLevel: 'low' }), raceConfig.overtaking);
    const high = calculateOvertakeProbability(baseAttempt({ attackerRiskLevel: 'high' }), raceConfig.overtaking);
    expect(high).toBeGreaterThan(low);
  });

  it('defenderBlockBonus (defend_position) geçiş olasılığını azaltır', () => {
    const undefended = calculateOvertakeProbability(baseAttempt({ defenderBlockBonus: 0 }), raceConfig.overtaking);
    const defended = calculateOvertakeProbability(baseAttempt({ defenderBlockBonus: 20 }), raceConfig.overtaking);
    expect(defended).toBeLessThan(undefended);
  });
});

describe('calculateAvailableSpace', () => {
  it('kulvarda yalnız olmak tam boşluk (100) verir', () => {
    expect(calculateAvailableSpace(1, raceConfig.overtaking)).toBe(100);
  });

  it('her ek at boşluğu azaltır', () => {
    const one = calculateAvailableSpace(1, raceConfig.overtaking);
    const three = calculateAvailableSpace(3, raceConfig.overtaking);
    expect(three).toBeLessThan(one);
  });

  it('0 altına inmez', () => {
    expect(calculateAvailableSpace(50, raceConfig.overtaking)).toBeGreaterThanOrEqual(0);
  });
});

describe('assignInitialLane', () => {
  it('front_runner en iç kulvara (1) atanır', () => {
    expect(assignInitialLane('front_runner', raceConfig.lanes)).toBe(1);
  });

  it('closer en dış kulvara atanır', () => {
    expect(assignInitialLane('closer', raceConfig.lanes)).toBe(raceConfig.lanes.count);
  });

  it('atanan kulvar her zaman [1, count] aralığındadır', () => {
    for (const style of ['front_runner', 'tracker', 'mid_pack', 'closer'] as const) {
      const lane = assignInitialLane(style, raceConfig.lanes);
      expect(lane).toBeGreaterThanOrEqual(1);
      expect(lane).toBeLessThanOrEqual(raceConfig.lanes.count);
    }
  });
});

describe('deriveLaneChange', () => {
  it('wantsChange false ise kulvar değişmez', () => {
    expect(deriveLaneChange(2, false, raceConfig.lanes)).toBe(2);
  });

  it('wantsChange true ise kulvar değişir ama sınırlar içinde kalır', () => {
    const changed = deriveLaneChange(1, true, raceConfig.lanes);
    expect(changed).not.toBe(1);
    expect(changed).toBeGreaterThanOrEqual(1);
    expect(changed).toBeLessThanOrEqual(raceConfig.lanes.count);
  });

  it('en dış kulvardan değişim istenirse sınırı aşmaz', () => {
    const changed = deriveLaneChange(raceConfig.lanes.count, true, raceConfig.lanes);
    expect(changed).toBeLessThanOrEqual(raceConfig.lanes.count);
    expect(changed).toBeGreaterThanOrEqual(1);
  });
});
