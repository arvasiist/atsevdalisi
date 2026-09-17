/**
 * Kimlik doğrulama/yetkilendirme domain'ine özgü hata tipleri. AUDIT_REPORT.md
 * Bulgu S1 (Critical — hiçbir yerde kimlik doğrulama yok) + S2/S4 (Critical/
 * High — IDOR: at eğitimi/bakımı/yarışı ve geniş okuma uç noktaları client'ın
 * gönderdiği id'lere güveniyordu) hardening'i (bu oturum).
 *
 * `domain/player/errors.ts` ile AYNI desen (düz `class X extends Error`).
 * Bilinçli olarak `domain/player` içinde DEĞİL, ayrı bir `domain/auth`
 * modülünde yaşarlar — kimlik doğrulama/yetkilendirme, "oyuncu" iş
 * kuralından (username/displayName/ekonomi) kavramsal olarak AYRI bir
 * endişedir (docs/ARCHITECTURE.md §4 "her domain modülü tek bir
 * sorumluluk"). ÖNEMLİ — `http-exception.filter.ts`'nin
 * "unmapped HttpException → NotFound" tuzağına (bkz. o dosyanın doc
 * yorumu) düşmemek için bu hatalar HER ZAMAN `DOMAIN_ERROR_MAP`'e
 * eklenir, asla çıplak bir Nest `UnauthorizedException`/`ForbiddenException`
 * olarak fırlatılmaz.
 */

/** `Authorization` header'ı hiç yok VEYA `Bearer <token>` formatında değil. */
export class MissingAuthTokenError extends Error {
  constructor() {
    super('Authorization header eksik. "Bearer <token>" formatında bir JWT gereklidir.');
    this.name = 'MissingAuthTokenError';
  }
}

/**
 * Bizim KENDİ imzaladığımız JWT'nin (bkz. `application/ports/token.service.ts`)
 * imzası geçersiz, süresi dolmuş veya `sub` claim'i eksik/geçersiz UUID.
 * Sağlayıcının (Google/Apple) ID token'ıyla İLGİLİ DEĞİLDİR — o hata
 * `InvalidProviderTokenError`'dır (aşağıda).
 */
export class InvalidAuthTokenError extends Error {
  constructor(message = 'Geçersiz veya süresi dolmuş oturum token\'ı.') {
    super(message);
    this.name = 'InvalidAuthTokenError';
  }
}

/**
 * Kimlik doğrulanmış oyuncu (`request.player.id`), üzerinde işlem yapmaya
 * çalıştığı kaynağın (at/ilan/oyuncu profili) SAHİBİ DEĞİL. `Unauthorized`
 * (401 — kimlik hiç doğrulanamadı) İLE KARIŞTIRILMAMALIDIR: bu her zaman
 * 403 Forbidden'dır (bkz. `ErrorCode.Forbidden`, `packages/shared-types/
 * src/error-codes.ts`).
 */
export class ForbiddenError extends Error {
  constructor(message = 'Bu kaynak üzerinde işlem yapma yetkiniz yok.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Google/Apple'ın ID token'ı doğrulanamadı (imza/audience/issuer/expiry) —
 * yalnızca `POST /auth/login`'de fırlatılır (bkz.
 * `application/use-cases/login-with-provider.use-case.ts`).
 */
export class InvalidProviderTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProviderTokenError';
  }
}
