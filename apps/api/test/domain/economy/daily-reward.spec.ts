import { describe, expect, it } from 'vitest';
import { assertCanClaimDailyReward, canClaimDailyReward } from '../../../src/domain/economy/daily-reward';
import { DailyRewardAlreadyClaimedError } from '../../../src/domain/economy/errors';

/**
 * FAZ 1 wiring, yedinci dilim — brief §37 "GÜNLÜK OYUN DÖNGÜSÜ" Daily
 * Reward. `care.spec.ts`'teki `canPerformCareAction` testleriyle AYNI
 * desen.
 */
describe('canClaimDailyReward', () => {
  it('hiç talep edilmemişse (null) her zaman uygun döner', () => {
    const result = canClaimDailyReward(null, new Date('2026-01-01T12:00:00Z'), 24);
    expect(result.eligible).toBe(true);
    expect(result.remainingMinutes).toBe(0);
  });

  it('cooldown penceresi dolmadan uygun DEĞİL döner, kalan dakikayı doğru hesaplar', () => {
    const lastClaimedAt = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-01-01T10:00:00Z'); // 10 saat geçti, 24 saat cooldown
    const result = canClaimDailyReward(lastClaimedAt, now, 24);
    expect(result.eligible).toBe(false);
    expect(result.remainingMinutes).toBe(14 * 60);
  });

  it('cooldown penceresi tam dolunca uygun döner', () => {
    const lastClaimedAt = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-01-02T00:00:00Z'); // tam 24 saat
    const result = canClaimDailyReward(lastClaimedAt, now, 24);
    expect(result.eligible).toBe(true);
  });

  it('cooldown penceresi geçtikten sonra uygun döner', () => {
    const lastClaimedAt = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-01-03T00:00:00Z'); // 48 saat
    const result = canClaimDailyReward(lastClaimedAt, now, 24);
    expect(result.eligible).toBe(true);
    expect(result.remainingMinutes).toBe(0);
  });
});

describe('assertCanClaimDailyReward', () => {
  it('uygunsa hiçbir şey fırlatmaz', () => {
    expect(() => assertCanClaimDailyReward(null, new Date(), 24)).not.toThrow();
  });

  it('uygun değilse DailyRewardAlreadyClaimedError fırlatır', () => {
    const lastClaimedAt = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-01-01T01:00:00Z');
    expect(() => assertCanClaimDailyReward(lastClaimedAt, now, 24)).toThrow(DailyRewardAlreadyClaimedError);
  });
});
