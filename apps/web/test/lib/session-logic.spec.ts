import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/lib/api-client';
import { adoptableStoredToken, isUnauthorized, refreshDelayMs } from '../../src/lib/session-logic';
import { deviceLabel } from '../../src/features/auth/device-label';

const NOW = Date.parse('2026-10-02T12:00:00Z');

describe('isUnauthorized — oturum yalnızca 401de silinir', () => {
  it('yalnızca 401 ApiError true', () => {
    expect(isUnauthorized(new ApiError('x', 'UNAUTHORIZED', 401))).toBe(true);
    expect(isUnauthorized(new ApiError('x', 'FORBIDDEN', 403))).toBe(false);
    expect(isUnauthorized(new ApiError('x', null, 502))).toBe(false);
    expect(isUnauthorized(new TypeError('Failed to fetch'))).toBe(false);
    expect(isUnauthorized(new Error('401 Unauthorized'))).toBe(false);
  });
});

describe('refreshDelayMs', () => {
  it('bitişten önce yeniler; geçmişte kalmışsa hemen; bilinmiyorsa null', () => {
    expect(refreshDelayMs('2026-10-02T13:00:00Z', NOW, 60_000)).toBe(59 * 60_000);
    expect(refreshDelayMs('2026-10-02T11:00:00Z', NOW, 60_000)).toBe(0);
    expect(refreshDelayMs(null, NOW)).toBeNull();
    expect(refreshDelayMs('bozuk', NOW)).toBeNull();
  });
});

describe('adoptableStoredToken — sekmeler arası çift yenilemeyi önler', () => {
  it('depodaki token farklı ve tazeyse benimsenir', () => {
    expect(adoptableStoredToken({ token: 'b', expiresAt: '2026-10-02T13:00:00Z' }, 'a', NOW)).toBe('b');
  });
  it('aynı, bayat, bitişi bilinmeyen ya da hiç olmayan token benimsenmez', () => {
    expect(adoptableStoredToken({ token: 'a', expiresAt: '2026-10-02T13:00:00Z' }, 'a', NOW)).toBeNull();
    expect(adoptableStoredToken({ token: 'b', expiresAt: '2026-10-02T12:00:30Z' }, 'a', NOW)).toBeNull();
    expect(adoptableStoredToken({ token: 'b', expiresAt: null }, 'a', NOW)).toBeNull();
    expect(adoptableStoredToken({ token: null, expiresAt: '2026-10-02T13:00:00Z' }, 'a', NOW)).toBeNull();
  });
});

describe('deviceLabel', () => {
  it('yaygın kullanıcı aracılarını etiketler', () => {
    expect(
      deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'),
    ).toBe('Chrome · Windows');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe(
      'Safari · iOS',
    );
    expect(deviceLabel('Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0')).toBe('Firefox · Linux');
    expect(deviceLabel(null)).toBe('Bilinmeyen cihaz');
    expect(deviceLabel('curl/8.0')).toBe('curl/8.0');
  });
});
