import { describe, expect, it } from 'vitest';
import { decideJockeyAction, type JockeyDecisionInput } from '../../../src/domain/race/jockey-decisions';
import raceConfigJson from '../../../../../config/race.config.json';
import type { RaceBalanceConfig } from '@at-sevdalisi/game-config';

const raceConfig = raceConfigJson as unknown as RaceBalanceConfig;

function baseInput(overrides: Partial<JockeyDecisionInput> = {}): JockeyDecisionInput {
  return {
    runtimeStamina: 60,
    positionFraction: 0.4,
    sprintAvailable: false,
    isBoxedIn: false,
    isBeingChased: false,
    riskLevel: 'normal',
    ...overrides,
  };
}

/** brief §60 karar ağacı — öncelik sırası pseudocode ile BİREBİR aynı olmalıdır. */
describe('decideJockeyAction — brief §60 öncelik sırası', () => {
  it('stamina düşükse her koşulda reduce_pace döner (en yüksek öncelik)', () => {
    const decision = decideJockeyAction(
      baseInput({
        runtimeStamina: 5,
        positionFraction: 0.95,
        sprintAvailable: true,
        isBoxedIn: true,
        isBeingChased: true,
        riskLevel: 'high',
      }),
      raceConfig.jockeyDecision,
    );
    expect(decision).toBe('reduce_pace');
  });

  it('final düz yolda ve sprint mümkünse push_for_finish döner', () => {
    const decision = decideJockeyAction(
      baseInput({ positionFraction: 0.9, sprintAvailable: true }),
      raceConfig.jockeyDecision,
    );
    expect(decision).toBe('push_for_finish');
  });

  it('final düz yolda ama sprint mümkün değilse push_for_finish DÖNMEZ', () => {
    const decision = decideJockeyAction(
      baseInput({ positionFraction: 0.9, sprintAvailable: false }),
      raceConfig.jockeyDecision,
    );
    expect(decision).not.toBe('push_for_finish');
  });

  it('boxed in ise search_overtake_lane döner (push_for_finish önceliğinden sonra)', () => {
    const decision = decideJockeyAction(baseInput({ isBoxedIn: true }), raceConfig.jockeyDecision);
    expect(decision).toBe('search_overtake_lane');
  });

  it('kovalanıyorsa VE risk seviyesi izin veriyorsa defend_position döner', () => {
    const decision = decideJockeyAction(baseInput({ isBeingChased: true, riskLevel: 'normal' }), raceConfig.jockeyDecision);
    expect(decision).toBe('defend_position');
  });

  it('kovalanıyor ama risk seviyesi izin vermiyorsa (low) defend_position DÖNMEZ', () => {
    const decision = decideJockeyAction(baseInput({ isBeingChased: true, riskLevel: 'low' }), raceConfig.jockeyDecision);
    expect(decision).not.toBe('defend_position');
  });

  it('hiçbir koşul sağlanmazsa hold döner', () => {
    const decision = decideJockeyAction(baseInput(), raceConfig.jockeyDecision);
    expect(decision).toBe('hold');
  });

  it('boxed in VE kovalanıyor olsa bile search_overtake_lane önceliklidir', () => {
    const decision = decideJockeyAction(
      baseInput({ isBoxedIn: true, isBeingChased: true, riskLevel: 'high' }),
      raceConfig.jockeyDecision,
    );
    expect(decision).toBe('search_overtake_lane');
  });
});
