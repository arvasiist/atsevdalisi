import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../config/config.service';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * CI #93/#94 kırmızı araştırması (bu oturum) — bkz. `database.module.ts`
 * içindeki `PgPoolLifecycle` doc yorumu, AYNI sızıntı deseni burada da
 * geçerli: ham `ioredis` client'ının `onModuleDestroy` kancası yok, her
 * e2e dosyasının açtığı bağlantı `app.close()`'da asla kapanmıyordu.
 */
@Injectable()
class RedisClientLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }
}

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
      useFactory: (config: AppConfigService) => {
        const redis = new Redis(config.env.redisUrl);
        // CI #95 kırmızı (bu oturum) — bkz. `database.module.ts`'teki
        // `pool.on('error', ...)` doc yorumu, AYNI Node EventEmitter
        // kuralı `ioredis` client'ı için de geçerlidir: dinleyicisiz bir
        // 'error' event'i tüm süreci çökertir.
        redis.on('error', () => undefined);
        return redis;
      },
    },
    RedisClientLifecycle,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
