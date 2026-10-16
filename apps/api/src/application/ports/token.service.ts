/**
 * `TokenService` — Application katmanının Infrastructure'a bağlandığı PORT
 * (interface), bkz. `application/ports/player.repository.ts` ile AYNI
 * desen (docs/ARCHITECTURE.md §4). AUDIT_REPORT.md Bulgu S1 hardening (bu
 * oturum) — brief §41/§50 Google/Apple Sign-In. Bizim KENDİ imzaladığımız
 * oturum JWT'sini kapsar (sağlayıcının ID token'ını DEĞİL — o
 * `IdentityProviderVerifier`'ın sorumluluğudur, bkz. `identity-provider.ts`).
 */

/** JWT `payload`'ının bu projedeki minimal şekli — yalnızca oyuncu id'si taşınır (hiçbir gizli stat/veri TAŞINMAZ, bkz. docs/SECURITY.md §9). */
export interface TokenPayload {
  /** Oyuncu id'si (JWT `sub` claim'i). */
  sub: string;
  /**
   * Oturum kimliği (02.10.2026, migration 0057). YOKSA token eski tiptir
   * (bkz. `domain/auth/session.ts`). `verify` yalnızca UUID biçimini kabul eder.
   */
  sid?: string;
  /** JWT `iat` (saniye) — yalnızca `verify` doldurur. */
  iat?: number;
}

export interface TokenService {
  /**
   * Erişim JWT'si imzalar. Süre çağırandan gelir (`auth.session.
   * accessTokenTtlSeconds`); eski sabit 30 günlük süre KALDIRILDI.
   */
  sign(payload: { sub: string; sid?: string }, expiresInSeconds: number): string;
  /**
   * İmza + süre doğrular, geçerliyse payload'ı döner. Geçersiz/süresi
   * dolmuş/bozuk bir token için `domain/auth/errors.ts` `InvalidAuthTokenError`
   * fırlatır — çıplak bir kütüphane hatası ASLA dışarı sızmaz (bkz.
   * `http-exception.filter.ts`'nin "unmapped hata" tuzağı).
   */
  verify(token: string): TokenPayload;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
