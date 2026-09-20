import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

/**
 * AUDIT_REPORT.md Bulgu S5 (High) hardening (bu oturum). `RateLimitGuard`
 * (bkz. o dosyanın doc yorumu) global `APP_GUARD` olarak kayıtlıdır AMA
 * bu meta veri OLMADAN hiçbir şey YAPMAZ (`IdempotencyScope`'un varsayılan
 * `'param'` davranışının AKSİNE, burada "işaretlenmemiş rota = sınırsız"
 * bilinçli bir tercihtir) — bu yüzden yalnızca AÇIKÇA `@RateLimit(...)`
 * ile işaretlenen rotalar sınırlanır. Bilinçli olarak SADECE kayıt
 * (`POST /players`) ve giriş (`POST /auth/login`) rotalarına uygulanır bu
 * turda: bunlar CI'nın n=10/50/100 eşzamanlılık testlerinin (bkz.
 * `test-helpers.ts` `sendConcurrentRequestsBatched`) HİÇBİRİNİN dokunmadığı
 * tek "herkese açık" rotalardır. Ekonomi uçlarına (satın alma, ödül talebi
 * — docs/SECURITY.md §7'nin ikinci maddesi) kullanıcı bazlı bir limit
 * eklemek BİLİNÇLİ olarak bu turun kapsamı DIŞINDA bırakıldı: o uçların
 * TAMAMI zaten CI'nın yoğun eşzamanlılık/idempotency testleriyle (AYNI
 * oyuncunun/anahtarın onlarca kez ÇAKIŞAN isteği — bu bir istismar DEĞİL,
 * bilerek test edilen bir YARIŞ DURUMU senaryosu) kaplı; bu iki farklı
 * yük türünü (meşru yeniden-deneme fırtınası vs. gerçek kötüye kullanım)
 * güvenle ayırt eden bir tasarım ayrı, dikkatli bir kapsam gerektirir
 * (bkz. AUDIT_REPORT.md S5 bölümü "Kalan kapsam" notu).
 */
export interface RateLimitOptions {
  /** Redis anahtarının bir parçası — aynı `name`'i paylaşan rotalar SAYACI PAYLAŞIR (bilerek, ayrı rotalar için farklı `name` kullanılmalı). */
  name: string;
  /** Pencere başına izin verilen istek sayısı. */
  limit: number;
  /** Sabit pencere genişliği (saniye). */
  windowSeconds: number;
}

export const RateLimit = (options: RateLimitOptions): MethodDecorator => SetMetadata(RATE_LIMIT_KEY, options);
