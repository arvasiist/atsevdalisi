import { describe, expect, it } from 'vitest';
import {
  canInviteToClub,
  describeInviteExpiry,
  normalizeInviteUsername,
} from '../../../src/features/club/club-invite-logic';

describe('kulüp daveti yardımcıları', () => {
  it('kullanıcı adını sunucuyla aynı biçimde normalleştirir', () => {
    expect(normalizeInviteUsername('  @Yarisci_42 ')).toBe('yarisci_42');
    expect(normalizeInviteUsername('ali')).toBe('ali');
    // Yalnızca BAŞTAKİ tek "@" atılır.
    expect(normalizeInviteUsername('@@ali')).toBe('@ali');
  });

  it('daveti yalnızca subay ve lider görür', () => {
    expect(canInviteToClub('leader')).toBe(true);
    expect(canInviteToClub('officer')).toBe(true);
    expect(canInviteToClub('member')).toBe(false);
    expect(canInviteToClub(null)).toBe(false);
    expect(canInviteToClub(undefined)).toBe(false);
  });

  it('kalan süreyi gün/saat olarak anlatır', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    const hours = (n: number) => new Date(now.getTime() + n * 3_600_000).toISOString();
    expect(describeInviteExpiry(hours(7 * 24), now)).toBe('7 gün kaldı');
    // Yeni açılmış davet birkaç saniye eksik: yine 7 gün.
    expect(describeInviteExpiry(hours(7 * 24 - 0.001), now)).toBe('7 gün kaldı');
    expect(describeInviteExpiry(hours(24), now)).toBe('1 gün kaldı');
    expect(describeInviteExpiry(hours(25), now)).toBe('1 gün kaldı');
    expect(describeInviteExpiry(hours(5.5), now)).toBe('5 saat kaldı');
    expect(describeInviteExpiry(hours(0.5), now)).toBe('1 saatten az kaldı');
    expect(describeInviteExpiry(hours(0), now)).toBe('süresi doldu');
    expect(describeInviteExpiry(hours(-1), now)).toBe('süresi doldu');
  });
});
