import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { RATE_LIMIT_KEY, type RateLimitOptions } from './rate-limit.decorator';
import { RateLimitExceededError } from './rate-limit.errors';

/**
 * `APP_GUARD` olarak global kaydedilir (bkz. `rate-limit.module.ts`) —
 * `AuthGuard` ile AYNI desen (docs/ARCHITECTURE.md §9.1: her guard tek
 * sorumluluk). `AuthGuard`'ın AKSİNE varsayılan davranış "izin ver"dir:
 * yalnızca `@RateLimit(...)` ile AÇIKÇA işaretlenmiş rotalarda devreye
 * girer (bkz. o decorator'ın doc yorumu).
 *
 * Redis `INCR` + (yalnızca sayaç YENİ oluşturulduysa) `EXPIRE` ile klasik
 * "sabit pencere" (fixed window) sayacı — docs/SECURITY.md §4/§5'teki
 * Idempotency-Key/satır kilitleme kadar kesin bir garanti VERMEZ (pencere
 * sınırında teorik olarak `2×limit`'e kadar istek geçebilir, bkz. herhangi
 * bir rate-limiting literatürü) ama bot/kaba-kuvvet koruması için YETERLİ
 * ve endüstri standardıdır — kritik finansal state burada TUTULMAZ (Redis
 * yalnızca sayaç için kullanılır, docs/SECURITY.md §11'in "Redis
 * authoritative değildir" ilkesiyle TUTARLI).
 *
 * `DISABLE_RATE_LIMIT=true` (bkz. `.github/workflows/ci.yml`) TÜM diğer
 * e2e testlerinin (`registerTestPlayer` her dosyada tekrar tekrar
 * çağrılır) bu limitlere TAKILMAMASI için CI genelinde AÇIKTIR — yeni
 * `rate-limit.e2e-spec.ts` KENDİ içinde `process.env.DISABLE_RATE_LIMIT`'i
 * geçici olarak `'false'`'e çevirip GERÇEK 429 davranışını izole şekilde
 * doğrular (bkz. o dosyanın doc yorumu). Bilinçli olarak `AppConfigService.
 * env`'in ÖNBELLEKLİ (cached) alanlarından biri OLARAK OKUNMAZ — `env`
 * yalnızca uygulama açılışında BİR KEZ okunur, bu ise test sırasında
 * DİNAMİK olarak açılıp kapatılabilmesi GEREKEN tek env değişkenidir.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) {
      return true;
    }
    if (process.env.DISABLE_RATE_LIMIT === 'true') {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const clientIp = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const redisKey = `ratelimit:${options.name}:${clientIp}`;

    const count = await this.redis.incr(redisKey);
    if (count === 1) {
      await this.redis.expire(redisKey, options.windowSeconds);
    }

    if (count > options.limit) {
      const ttl = await this.redis.ttl(redisKey);
      const retryAfterSeconds = ttl > 0 ? ttl : options.windowSeconds;
      throw new RateLimitExceededError(
        `Çok fazla istek gönderildi. ${retryAfterSeconds} saniye sonra tekrar deneyin.`,
        retryAfterSeconds,
      );
    }

    return true;
  }
}
