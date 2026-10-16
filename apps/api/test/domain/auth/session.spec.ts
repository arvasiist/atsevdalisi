import { describe, expect, it } from 'vitest';
import { isAccessTokenAuthorized, normalizeUserAgent } from '../../../src/domain/auth/session';

const NOW = new Date('2026-10-02T12:00:00Z');
const LATER = new Date('2026-10-30T12:00:00Z');
const active = { revokedAt: null, expiresAt: LATER };

describe('isAccessTokenAuthorized (migration 0057)', () => {
  it('silinmiş hesap hiçbir token tipiyle geçmez', () => {
    const state = { playerExists: false, tokensValidAfter: null, session: active };
    expect(isAccessTokenAuthorized({ sessionId: 's', issuedAtSeconds: 1 }, state, NOW)).toBe(false);
    expect(isAccessTokenAuthorized({ sessionId: null, issuedAtSeconds: 1 }, state, NOW)).toBe(false);
  });

  it('oturumlu token: satır yok / kapalı / süresi dolmuş → red', () => {
    const base = { playerExists: true, tokensValidAfter: null };
    const claims = { sessionId: 's', issuedAtSeconds: 1 };
    expect(isAccessTokenAuthorized(claims, { ...base, session: active }, NOW)).toBe(true);
    expect(isAccessTokenAuthorized(claims, { ...base, session: null }, NOW)).toBe(false);
    expect(isAccessTokenAuthorized(claims, { ...base, session: { revokedAt: NOW, expiresAt: LATER } }, NOW)).toBe(false);
    expect(isAccessTokenAuthorized(claims, { ...base, session: { revokedAt: null, expiresAt: NOW } }, NOW)).toBe(false);
  });

  it('oturumlu token kesim noktasından etkilenmez (kendi satırı yeter)', () => {
    const state = { playerExists: true, tokensValidAfter: LATER, session: active };
    expect(isAccessTokenAuthorized({ sessionId: 's', issuedAtSeconds: 1 }, state, NOW)).toBe(true);
  });

  it('eski token: kesim yoksa geçer; kesimden önce ya da AYNI saniyede basılmışsa red', () => {
    const cutoff = new Date('2026-10-02T11:00:00.500Z');
    const cutoffSecond = Math.floor(cutoff.getTime() / 1000);
    const state = { playerExists: true, tokensValidAfter: cutoff, session: null };
    expect(
      isAccessTokenAuthorized({ sessionId: null, issuedAtSeconds: 5 }, { ...state, tokensValidAfter: null }, NOW),
    ).toBe(true);
    expect(isAccessTokenAuthorized({ sessionId: null, issuedAtSeconds: cutoffSecond - 1 }, state, NOW)).toBe(false);
    expect(isAccessTokenAuthorized({ sessionId: null, issuedAtSeconds: cutoffSecond }, state, NOW)).toBe(false);
    expect(isAccessTokenAuthorized({ sessionId: null, issuedAtSeconds: cutoffSecond + 1 }, state, NOW)).toBe(true);
    expect(isAccessTokenAuthorized({ sessionId: null, issuedAtSeconds: null }, state, NOW)).toBe(false);
  });
});

describe('normalizeUserAgent', () => {
  it('kırpar, boşu ve metin olmayanı null yapar', () => {
    expect(normalizeUserAgent('  Firefox  ', 200)).toBe('Firefox');
    expect(normalizeUserAgent('x'.repeat(300), 200)).toHaveLength(200);
    expect(normalizeUserAgent('   ', 200)).toBeNull();
    expect(normalizeUserAgent(undefined, 200)).toBeNull();
    expect(normalizeUserAgent(['a'], 200)).toBeNull();
  });
});
