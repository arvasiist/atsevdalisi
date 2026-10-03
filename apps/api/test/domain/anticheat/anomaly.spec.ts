import { describe, expect, it } from 'vitest';
import { loadAnticheatConfig } from '@at-sevdalisi/game-config';
import { accountAgeDays, validateAnticheatConfig } from '../../../src/domain/anticheat/anomaly';

describe('anti-cheat config + yardımcılar (Faz 7)', () => {
  const config = loadAnticheatConfig();
  it('gerçek config geçerli', () => {
    expect(validateAnticheatConfig(config)).toEqual([]);
  });
  it('anlamsız eşikler yakalanır (tek gönderen/tek satış desen değildir)', () => {
    const problems = validateAnticheatConfig({
      ...config,
      windowDays: 0,
      giftFunnel: { minDistinctNewSenders: 1 },
      repeatTradePair: { minTrades: 1 },
    });
    expect(problems.join('|')).toMatch(/windowDays/);
    expect(problems.join('|')).toMatch(/giftFunnel/);
    expect(problems.join('|')).toMatch(/repeatTradePair/);
  });
  it('hesap yaşı gün olarak aşağı yuvarlanır, negatif olmaz', () => {
    const now = new Date('2026-10-03T12:00:00Z');
    expect(accountAgeDays(new Date('2026-10-01T13:00:00Z'), now)).toBe(1);
    expect(accountAgeDays(new Date('2026-10-04T00:00:00Z'), now)).toBe(0);
  });
});
