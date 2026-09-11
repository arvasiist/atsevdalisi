import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../config/config.service';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Redis client — session, leaderboard cache, idempotency key takibi
 * (docs/SECURITY.md §4) ve rate limiting için kullanılır (brief §78).
 * Kritik finansal state Redis'e authoritative olarak bırakılmaz.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => new Redis(config.env.redisUrl),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
