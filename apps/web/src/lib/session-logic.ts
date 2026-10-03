import { ApiError } from './api-client';

/**
 * OTURUM KARARLARI (02.10.2026, migration 0057) — saf; `player-context.tsx`
 * kullanır, `test/lib/session-logic.spec.ts` kilitler.
 */

export const SESSION_STORAGE_KEYS = {
  playerId: 'atSevdalisi.playerId',
  accessToken: 'atSevdalisi.authToken',
  refreshToken: 'atSevdalisi.refreshToken',
  accessExpiresAt: 'atSevdalisi.accessExpiresAt',
} as const;

/** Erişim token'ı bitmeden bu kadar önce yenilenir (soketler bayat token'la bağlanmasın). */
export const REFRESH_LEAD_MS = 60_000;

/**
 * Oturum YALNIZCA sunucu "kimliğin geçersiz" dediğinde (401) silinir. Ağ
 * hatası, 5xx ya da proxy hatası oturumu SİLMEZ — eskiden her hata siliyordu
 * ve bağlantısı kopan misafir hesabını kalıcı olarak kaybediyordu.
 */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** 02.10.2026 (Faz 10) — hesap askıda/yasaklı (403 `ACCOUNT_SUSPENDED`): oturum korunur, mesaj gösterilir. */
export function isAccountSuspended(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403 && error.code === 'ACCOUNT_SUSPENDED';
}

/** Proaktif yenilemeye kalan süre; bilinmeyen/bozuk bitişte `null` (yalnızca 401'de yenilenir). */
export function refreshDelayMs(accessExpiresAt: string | null, now: number, leadMs: number = REFRESH_LEAD_MS): number | null {
  if (accessExpiresAt === null) return null;
  const expiresAt = Date.parse(accessExpiresAt);
  if (Number.isNaN(expiresAt)) return null;
  return Math.max(0, expiresAt - leadMs - now);
}

/**
 * Başka bir sekme token'ı zaten yenilediyse (depodaki token bellektekinden
 * farklı ve henüz taze) yeniden yenilemek yerine onu benimse — aynı refresh
 * token'la ikinci yenileme sunucuda "yeniden kullanım" sayılır ve oturumu
 * KAPATIR.
 */
export function adoptableStoredToken(
  stored: { token: string | null; expiresAt: string | null },
  current: string | null,
  now: number,
  leadMs: number = REFRESH_LEAD_MS,
): string | null {
  if (stored.token === null || stored.token === current) return null;
  const delay = refreshDelayMs(stored.expiresAt, now, leadMs);
  return delay !== null && delay > 0 ? stored.token : null;
}
