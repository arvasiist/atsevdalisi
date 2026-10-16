import { describe, expect, it } from 'vitest';
import { loadSocialConfig } from '@at-sevdalisi/game-config';
import {
  parsePlayerSearchQuery,
  resolvePresence,
  sortByPresence,
  usernamePrefixLikePattern,
  validatePresenceConfig,
} from '../../../src/domain/social/presence';

describe('oyuncu arama + çevrimiçi durumu (16.10.2026)', () => {
  const social = loadSocialConfig();
  const now = new Date('2026-10-16T12:00:00.000Z');

  it('config geçerli; pencere nabızdan büyük, yazma aralığı nabızdan küçük olmalı', () => {
    expect(validatePresenceConfig(social)).toEqual([]);
    expect(
      validatePresenceConfig({ ...social, presence: { heartbeatSeconds: 60, onlineWindowSeconds: 60, touchMinIntervalSeconds: 30 } }),
    ).not.toEqual([]);
    expect(
      validatePresenceConfig({ ...social, presence: { heartbeatSeconds: 60, onlineWindowSeconds: 120, touchMinIntervalSeconds: 60 } }),
    ).not.toEqual([]);
  });

  it('sorgu: UUID tam eşleşme; kullanıcı adı ön eki küçük harf, "@" atılır; alfabe dışı/kısa → null', () => {
    const id = '0b6f6c2e-6a5e-4b8d-9e2a-1f3c4d5e6f70';
    expect(parsePlayerSearchQuery(` ${id.toUpperCase()} `, 3)).toEqual({ kind: 'id', playerId: id });
    expect(parsePlayerSearchQuery('@AtCi_01', 3)).toEqual({ kind: 'username', prefix: 'atci_01' });
    expect(parsePlayerSearchQuery('ab', 3)).toBeNull();
    expect(parsePlayerSearchQuery("ali'; DROP", 3)).toBeNull();
    expect(parsePlayerSearchQuery('a%b', 3)).toBeNull();
  });

  it('LIKE kalıbında "_" ve "%" kaçırılır', () => {
    expect(usernamePrefixLikePattern('a_b')).toBe('a\\_b%');
  });

  it('durum: gizli → hidden + son görülme yok; hiç görülmedi → offline; pencere içi → online', () => {
    expect(resolvePresence({ lastSeenAt: now, showOnlineStatus: false }, now, 150)).toEqual({ state: 'hidden', lastSeenAt: null });
    expect(resolvePresence({ lastSeenAt: null, showOnlineStatus: true }, now, 150)).toEqual({ state: 'offline', lastSeenAt: null });
    const recent = new Date(now.getTime() - 100_000);
    expect(resolvePresence({ lastSeenAt: recent, showOnlineStatus: true }, now, 150).state).toBe('online');
    const old = new Date(now.getTime() - 151_000);
    expect(resolvePresence({ lastSeenAt: old, showOnlineStatus: true }, now, 150)).toEqual({
      state: 'offline',
      lastSeenAt: old.toISOString(),
    });
  });

  it('sıralama: çevrimiçi → çevrimdışı (en son görülen önce) → gizli', () => {
    const item = (displayName: string, state: 'online' | 'offline' | 'hidden', lastSeenAt: string | null) => ({
      displayName,
      presence: { state, lastSeenAt },
    });
    const sorted = sortByPresence([
      item('Gizli', 'hidden', null),
      item('Eski', 'offline', '2026-10-15T00:00:00.000Z'),
      item('Yeni', 'offline', '2026-10-16T00:00:00.000Z'),
      item('Açık', 'online', '2026-10-16T11:59:00.000Z'),
    ]);
    expect(sorted.map((entry) => entry.displayName)).toEqual(['Açık', 'Yeni', 'Eski', 'Gizli']);
  });
});
