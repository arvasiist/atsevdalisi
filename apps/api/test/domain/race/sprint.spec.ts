import { describe, expect, it } from 'vitest';
import { deriveSprintBonus } from '../../../src/domain/race/sprint';
import raceConfigJson from '../../../../../config/race.config.json';
import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';

const raceConfig = raceConfigJson as unknown as RaceBalanceConfig;

describe('deriveSprintBonus', () => {
  it('decision push_for_finish değilse her zaman 0 döner', () => {
    expect(deriveSprintBonus(80, 'hold', 90, raceConfig.sprint)).toBe(0);
    expect(deriveSprintBonus(80, 'reduce_pace', 90, raceConfig.sprint)).toBe(0);
    expect(deriveSprintBonus(80, 'defend_position', 90, raceConfig.sprint)).toBe(0);
    expect(deriveSprintBonus(80, 'search_overtake_lane', 90, raceConfig.sprint)).toBe(0);
  });

  it('push_for_finish ama stamina rezervin altındaysa 0 döner (savunma hattı)', () => {
    const belowThreshold = raceConfig.sprint.staminaReserveThreshold - 1;
    expect(deriveSprintBonus(belowThreshold, 'push_for_finish', 90, raceConfig.sprint)).toBe(0);
  });

  it('push_for_finish ve yeterli stamina varsa pozitif bir bonus döner', () => {
    const bonus = deriveSprintBonus(80, 'push_for_finish', 70, raceConfig.sprint);
    expect(bonus).toBeGreaterThan(0);
  });

  it('daha yüksek stamina daha yüksek bonus verir (aynı jokey becerisinde)', () => {
    const low = deriveSprintBonus(30, 'push_for_finish', 70, raceConfig.sprint);
    const high = deriveSprintBonus(90, 'push_for_finish', 70, raceConfig.sprint);
    expect(high).toBeGreaterThan(low);
  });

  it('daha yüksek jokey becerisi daha yüksek bonus verir (aynı stamina)', () => {
    const low = deriveSprintBonus(80, 'push_for_finish', 30, raceConfig.sprint);
    const high = deriveSprintBonus(80, 'push_for_finish', 95, raceConfig.sprint);
    expect(high).toBeGreaterThan(low);
  });
});
