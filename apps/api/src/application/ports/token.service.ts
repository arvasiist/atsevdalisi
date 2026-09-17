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
}

export interface TokenService {
  /** Yeni bir oturum JWT'si imzalar (geçerlilik süresi: `AppConfigService.env.jwtExpiresInSeconds`). */
  sign(payload: TokenPayload): string;
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
