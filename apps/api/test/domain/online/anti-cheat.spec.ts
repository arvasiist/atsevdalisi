import { describe, expect, it } from 'vitest';
import { assertSnapshotMatchesAuthoritative, pickAllowedClientFields } from '../../../src/domain/online/anti-cheat';
import { AntiCheatViolationError } from '../../../src/domain/online/errors';
import type { RaceEntrantSnapshot } from '@at-sevdalisi/shared-types';

function buildSnapshot(overrides: Partial<RaceEntrantSnapshot> = {}): RaceEntrantSnapshot {
  return {
    horseId: 'horse-1',
    speed: 80,
    stamina: 75,
    acceleration: 70,
    fitness: 90,
    fatigue: 10,
    health: 95,
    morale: 85,
    surfaceCompatibility: 80,
    distanceCompatibility: 75,
    jockeySkillComposite: 70,
    form: 50,
    tactic: {
      racingStyle: 'mid_pack',
      riskLevel: 'normal',
      startApproach: 'balanced',
      finalStretchPlan: 'normal',
    },
    ...overrides,
  };
}

describe('pickAllowedClientFields', () => {
  it('sadece izin verilen alanları alır, geri kalanını atar', () => {
    const clientPayload = { tacticalStyle: 'front_runner', riskLevel: 'high', speed: 99, money: 1000000 };
    const picked = pickAllowedClientFields(clientPayload, ['tacticalStyle', 'riskLevel'] as const);

    expect(picked).toEqual({ tacticalStyle: 'front_runner', riskLevel: 'high' });
    expect((picked as Record<string, unknown>).speed).toBeUndefined();
    expect((picked as Record<string, unknown>).money).toBeUndefined();
  });

  it('client payload\'ında olmayan izinli alanı eklemez', () => {
    const clientPayload = { tacticalStyle: 'front_runner' };
    const picked = pickAllowedClientFields(clientPayload as Record<string, unknown>, ['tacticalStyle', 'riskLevel'] as const);
    expect('riskLevel' in picked).toBe(false);
  });
});

describe('assertSnapshotMatchesAuthoritative', () => {
  it('client snapshot göndermemişse (null) hiçbir şey yapmaz', () => {
    expect(() => assertSnapshotMatchesAuthoritative(null, buildSnapshot())).not.toThrow();
    expect(() => assertSnapshotMatchesAuthoritative(undefined, buildSnapshot())).not.toThrow();
  });

  it('client\'ın gönderdiği snapshot authoritative ile birebir aynıysa hata fırlatmaz', () => {
    const authoritative = buildSnapshot();
    const clientCopy = buildSnapshot();
    expect(() => assertSnapshotMatchesAuthoritative(clientCopy, authoritative)).not.toThrow();
  });

  it('client "speed"i şişirmeye çalışırsa AntiCheatViolationError fırlatır (brief §42)', () => {
    const authoritative = buildSnapshot({ speed: 80 });
    const cheated = buildSnapshot({ speed: 99 });
    expect(() => assertSnapshotMatchesAuthoritative(cheated, authoritative)).toThrow(AntiCheatViolationError);
  });

  it('sadece "tactic" alanındaki fark (oyuncunun taktik seçimi) hataya yol açmaz', () => {
    const authoritative = buildSnapshot({ tactic: { racingStyle: 'mid_pack', riskLevel: 'normal', startApproach: 'balanced', finalStretchPlan: 'normal' } });
    const clientChoice = buildSnapshot({ tactic: { racingStyle: 'front_runner', riskLevel: 'high', startApproach: 'aggressive', finalStretchPlan: 'early_sprint' } });
    expect(() => assertSnapshotMatchesAuthoritative(clientChoice, authoritative)).not.toThrow();
  });
});
