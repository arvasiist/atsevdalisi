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

/**
 * E-posta/şifre GÖVDESİ biçimsel olarak geçersiz (30.09.2026) — yalnızca
 * "Hesabını kaydet" yolunda kullanılır (400). GİRİŞ yolunda biçim hatası da
 * `InvalidCredentialsError` döner: "bu e-posta geçerli mi / kayıtlı mı"
 * bilgisi sızmasın.
 */
export class InvalidCredentialsInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCredentialsInputError';
  }
}

/**
 * E-posta ya da şifre yanlış (401). "E-posta kayıtlı değil" ile "şifre
 * yanlış" BİLEREK aynı hatadır — ayrı olsalardı giriş ucu kayıtlı e-posta
 * adreslerini yoklamanın bir yolu olurdu (`PLAYER_BLOCKED` ile aynı ilke).
 */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('E-posta ya da şifre hatalı.');
    this.name = 'InvalidCredentialsError';
  }
}

/** Bu e-posta başka bir hesaba bağlı (409). */
export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('Bu e-posta adresi başka bir hesapta kullanılıyor.');
    this.name = 'EmailAlreadyRegisteredError';
  }
}

/** Bu oyuncunun zaten bir e-posta/şifresi var (409) — ikinci kez kaydedilemez. */
export class CredentialsAlreadySetError extends Error {
  constructor() {
    super('Bu hesap zaten bir e-posta ve şifreyle kayıtlı.');
    this.name = 'CredentialsAlreadySetError';
  }
}

/**
 * Sıfırlama bağlantısı geçersiz, süresi dolmuş ya da kullanılmış (400,
 * migration 0047). Üç durum BİLEREK tek hatadır — hangisi olduğunu söylemek
 * bağlantı yoklamaya bilgi verirdi.
 */
export class InvalidResetTokenError extends Error {
  constructor() {
    super('Şifre sıfırlama bağlantısı geçersiz ya da süresi dolmuş. Yeni bir bağlantı iste.');
    this.name = 'InvalidResetTokenError';
  }
}

/**
 * Bu Google/Apple hesabı BAŞKA bir oyuncuya bağlı (409, migration 0048).
 * Enumerasyon riski yoktur: çağıran, kimlik belgesiyle o hesabın sahibi
 * olduğunu ZATEN kanıtlamıştır.
 */
export class ProviderIdentityTakenError extends Error {
  constructor() {
    super('Bu hesap zaten başka bir oyuncuya bağlı. O oyuncuya geçmek için çıkış yapıp bu hesapla giriş yap.');
    this.name = 'ProviderIdentityTakenError';
  }
}

/** Bu oyuncunun bu sağlayıcıdan zaten BAŞKA bir hesabı bağlı (409). */
export class ProviderAlreadyLinkedError extends Error {
  constructor() {
    super('Bu oyuncuya zaten başka bir hesap bağlı.');
    this.name = 'ProviderAlreadyLinkedError';
  }
}

/**
 * Yenileme token'ı geçersiz, süresi dolmuş, iptal edilmiş ya da YENİDEN
 * kullanılmış (401, migration 0057). Dört durum BİLEREK tek hatadır.
 */
export class InvalidRefreshTokenError extends Error {
  constructor() {
    super('Oturum yenilenemedi. Yeniden giriş yap.');
    this.name = 'InvalidRefreshTokenError';
  }
}

/** Oturum yok ya da çağırana ait değil (404 — başkasının oturumu VAR mı sızdırılmaz). */
export class SessionNotFoundError extends Error {
  constructor() {
    super('Oturum bulunamadı.');
    this.name = 'SessionNotFoundError';
  }
}

/**
 * `POST /auth/session` yalnızca OTURUMSUZ (02.10.2026 öncesi, `sid`siz)
 * token'ı yükseltir (409). Oturumlu kısa ömürlü bir erişim token'ının uzun
 * ömürlü bir yenileme token'ı basması, çalınan token'ı kalıcı kılardı.
 */
export class SessionUpgradeNotAllowedError extends Error {
  constructor() {
    super('Bu oturum zaten yenilenebilir; yükseltme gerekmiyor.');
    this.name = 'SessionUpgradeNotAllowedError';
  }
}

/** Doğrulama bağlantısı geçersiz, süresi dolmuş, kullanılmış ya da e-posta değişmiş (400, migration 0058) — tek hata. */
export class InvalidVerificationTokenError extends Error {
  constructor() {
    super('Doğrulama bağlantısı geçersiz ya da süresi dolmuş. Hesap sayfasından yeni bağlantı iste.');
    this.name = 'InvalidVerificationTokenError';
  }
}

/** Doğrulanacak e-posta yok — misafir hesap (409). */
export class NoAccountEmailError extends Error {
  constructor() {
    super('Hesabına kayıtlı bir e-posta yok. Önce hesabını kaydet.');
    this.name = 'NoAccountEmailError';
  }
}

/** E-posta zaten doğrulanmış (409). */
export class EmailAlreadyVerifiedError extends Error {
  constructor() {
    super('E-postan zaten doğrulanmış.');
    this.name = 'EmailAlreadyVerifiedError';
  }
}

/** Hesap silme onayı (kullanıcı adı) eşleşmedi (400). */
export class DeletionConfirmationMismatchError extends Error {
  constructor() {
    super('Onay için kullanıcı adını aynen yazmalısın.');
    this.name = 'DeletionConfirmationMismatchError';
  }
}

/**
 * Hesap silmede şifre yanlış (403 — 401 DEĞİL: 401 istemcide "oturum
 * geçersiz" demektir ve oturumu silerdi).
 */
export class DeletionPasswordInvalidError extends Error {
  constructor() {
    super('Şifre hatalı.');
    this.name = 'DeletionPasswordInvalidError';
  }
}

/** Parası emanette olan hesap silinemez (409); `blockers` neyin bitirilmesi gerektiğini söyler. */
export class AccountDeletionBlockedError extends Error {
  constructor(readonly blockers: readonly string[]) {
    super(`Hesap şu an silinemez: ${blockers.join(', ')}. Önce bunları tamamla.`);
    this.name = 'AccountDeletionBlockedError';
  }
}
