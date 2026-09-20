import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

/**
 * AUDIT_REPORT.md Bulgu S5 (High) hardening (bu oturum, iki dilim).
 * `RateLimitGuard` (bkz. o dosyanın doc yorumu) global `APP_GUARD` olarak
 * kayıtlıdır AMA bu meta veri OLMADAN hiçbir şey YAPMAZ (`IdempotencyScope`'un
 * varsayılan `'param'` davranışının AKSİNE, burada "işaretlenmemiş rota =
 * sınırsız" bilinçli bir tercihtir) — bu yüzden yalnızca AÇIKÇA
 * `@RateLimit(...)` ile işaretlenen rotalar sınırlanır.
 *
 * **Birinci dilim** — kayıt (`POST /players`) ve giriş (`POST /auth/login`),
 * `keyBy: 'ip'`: bunlar `@Public()` (token'sız) olduğundan kimlik
 * doğrulanmış bir oyuncu kimliği HENÜZ YOK, IP TEK ayırt edici.
 *
 * **İkinci dilim** — ekonomi uçları (satın alma, ödül talebi —
 * docs/SECURITY.md §7'nin ikinci maddesi), `keyBy: 'player'`: ilk turda
 * BİLİNÇLİ olarak ertelenmişti çünkü bu uçların TAMAMI zaten CI'nın yoğun
 * eşzamanlılık/idempotency testleriyle (AYNI oyuncunun onlarca kez
 * ÇAKIŞAN/FARKLI-anahtarlı isteği — bkz. `stable.e2e-spec.ts`'in n=100
 * testi, HER isteğin FARKLI bir Idempotency-Key kullandığı) kaplıydı.
 * Çözüm bir "istismar vs. meşru yeniden-deneme" ayrım algoritması İCAT
 * ETMEK DEĞİLDİ — CI zaten `.github/workflows/ci.yml`'nin
 * `DISABLE_RATE_LIMIT: 'true'` bayrağıyla TÜM rotalarda (yalnızca
 * kayıt/giriş değil) baştan devre dışı bırakılıyordu (bkz.
 * `RateLimitGuard`'ın doc yorumu) — yani bu ikinci dilim, birinci dilimde
 * zaten kurulan altyapıyı (opt-in decorator + CI-genelinde bayrak + izole
 * e2e testiyle GERÇEK davranışı doğrulama) YENİDEN KULLANMAKTAN ibaret;
 * ek bir CI riski YOKTU, yalnızca zaman/dikkat kısıtı vardı ilk turda.
 */
export interface RateLimitOptions {
  /** Redis anahtarının bir parçası — aynı `name`'i paylaşan rotalar SAYACI PAYLAŞIR (bilerek, ayrı rotalar için farklı `name` kullanılmalı). */
  name: string;
  /** Pencere başına izin verilen istek sayısı. */
  limit: number;
  /** Sabit pencere genişliği (saniye). */
  windowSeconds: number;
  /**
   * `'ip'` — kayıt/giriş gibi `@Public()` (token'sız) rotalar için: henüz
   * kimlik doğrulanmamış bir istemciyi ayırt etmenin TEK yolu IP'dir.
   * `'player'` — AUDIT_REPORT.md Bulgu S5'in ikinci turu (bu oturum,
   * ekonomi uçları): kimlik doğrulanmış bir rotada IP bazlı limit YANLIŞ
   * birimdir (ör. aynı NAT/ofis ağındaki birden fazla GERÇEK oyuncu
   * birbirini bloke eder) — bunun yerine `AuthGuard`'ın doldurduğu
   * `request.player.id` kullanılır. Bu YALNIZCA `AuthGuard`'ın (global
   * `APP_GUARD`, bkz. `auth.module.ts`) `RateLimitGuard`'dan ÖNCE
   * çalıştığı sürece güvenlidir — bkz. `app.module.ts`'teki `imports`
   * sıralaması notu ve `RateLimitGuard`'ın doc yorumu.
   */
  keyBy: 'ip' | 'player';
}

export const RateLimit = (options: RateLimitOptions): MethodDecorator => SetMetadata(RATE_LIMIT_KEY, options);
