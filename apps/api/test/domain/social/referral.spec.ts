import { describe, expect, it } from 'vitest';
import { loadReferralConfig } from '@at-sevdalisi/game-config';
import {
  REFERRAL_CODE_ALPHABET,
  canAttachReferral,
  normalizeReferralCode,
  qualifyReferral,
  referralCodeFromBytes,
  referralRewardAllowance,
  validateReferralConfig,
} from '../../../src/domain/social/referral';

describe('arkadaş daveti saf kuralları (16.10.2026)', () => {
  const config = loadReferralConfig();

  it('config geçerli; koşulsuz ödül ve ters tavan reddedilir', () => {
    expect(validateReferralConfig(config)).toEqual([]);
    expect(validateReferralConfig({ ...config, conditions: { ...config.conditions, minFinishedRaces: 0 } })).not.toEqual([]);
    expect(validateReferralConfig({ ...config, maxRewardedPerInviterPerDay: config.maxRewardedPerInviter + 1 })).not.toEqual([]);
    expect(validateReferralConfig({ ...config, codeLength: 4 })).not.toEqual([]);
  });

  it('kod alfabeden üretilir, karışan karakter içermez; girdi normalleşir', () => {
    const code = referralCodeFromBytes(new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253]), 8);
    expect(code).toHaveLength(8);
    expect([...code].every((char) => REFERRAL_CODE_ALPHABET.includes(char))).toBe(true);
    expect(REFERRAL_CODE_ALPHABET).not.toMatch(/[01OIL]/);
    expect(normalizeReferralCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(normalizeReferralCode('ab')).toBeNull();
    expect(normalizeReferralCode("ABC'; DROP")).toBeNull();
    expect(normalizeReferralCode(42)).toBeNull();
  });

  it('bağlama penceresi hesap yaşından', () => {
    const created = new Date('2026-10-16T00:00:00.000Z');
    expect(canAttachReferral(created, new Date('2026-10-18T23:00:00.000Z'), 72)).toBe(true);
    expect(canAttachReferral(created, new Date('2026-10-19T01:00:00.000Z'), 72)).toBe(false);
  });

  it('koşul: e-posta + bitmiş yarış; silinmiş ya da engelli çift asla', () => {
    const base = { emailVerified: true, finishedRaces: 3, inviteeDeleted: false, blockedBetween: false };
    const conditions = { requireEmailVerified: true, minFinishedRaces: 3 };
    expect(qualifyReferral(base, conditions).qualified).toBe(true);
    expect(qualifyReferral({ ...base, emailVerified: false }, conditions).qualified).toBe(false);
    expect(qualifyReferral({ ...base, emailVerified: false }, { ...conditions, requireEmailVerified: false }).qualified).toBe(true);
    expect(qualifyReferral({ ...base, finishedRaces: 2 }, conditions).qualified).toBe(false);
    expect(qualifyReferral({ ...base, inviteeDeleted: true }, conditions).qualified).toBe(false);
    expect(qualifyReferral({ ...base, blockedBetween: true }, conditions).qualified).toBe(false);
  });

  it('tavan: ömür boyu ve günlük kalanın küçüğü, eksiye düşmez', () => {
    expect(referralRewardAllowance({ maxRewardedPerInviter: 20, maxRewardedPerInviterPerDay: 3 }, 0, 0)).toBe(3);
    expect(referralRewardAllowance({ maxRewardedPerInviter: 20, maxRewardedPerInviterPerDay: 3 }, 19, 0)).toBe(1);
    expect(referralRewardAllowance({ maxRewardedPerInviter: 20, maxRewardedPerInviterPerDay: 3 }, 25, 5)).toBe(0);
  });
});
