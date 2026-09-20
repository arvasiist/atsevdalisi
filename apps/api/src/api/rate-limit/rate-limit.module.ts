import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';

/**
 * AUDIT_REPORT.md Bulgu S5 (High) hardening (bu oturum) — `AuthModule`'ün
 * `AuthGuard`'ı `APP_GUARD` ile global kaydetme deseniyle AYNI (bkz. o
 * modülün doc yorumu). `RedisModule` `@Global()` olduğundan (bkz.
 * `infrastructure/redis/redis.module.ts`) `REDIS_CLIENT`'ı ayrıca
 * `imports`'a eklemeye GEREK YOK.
 */
@Module({
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class RateLimitModule {}
