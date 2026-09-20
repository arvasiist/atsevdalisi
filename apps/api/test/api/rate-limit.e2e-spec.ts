import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REDIS_CLIENT } from '../../src/infrastructure/redis/redis.module';
import { bootstrapTestApp, uniqueUsername } from './test-helpers';

/**
 * AUDIT_REPORT.md Bulgu S5 (High) hardening (bu oturum) — `RateLimitGuard`
 * (bkz. `apps/api/src/api/rate-limit/rate-limit.guard.ts`) `POST /players`
 * rotasını `limit: 10, windowSeconds: 300` ile sınırlar (bkz.
 * `player.controller.ts`daki `@RateLimit(...)`).
 *
 * ÖNEMLİ — bu dosya `.github/workflows/ci.yml`'nin `DISABLE_RATE_LIMIT:
 * 'true'` bayrağını (TÜM diğer e2e dosyalarının `registerTestPlayer`'ı
 * tekrar tekrar çağırmasının 429'a TAKILMAMASI için ayarlanır, bkz. o
 * dosyanın doc yorumu) KENDİ İÇİNDE, YALNIZCA bu `describe` bloğu
 * çalışırken `process.env.DISABLE_RATE_LIMIT`'i `'false'`'e çevirerek
 * GEÇİCİ olarak devre dışı bırakır — `RateLimitGuard` bu bayrağı HER
 * istekte (önbelleğe almadan, bkz. o guard'ın doc yorumu) canlı okuduğundan
 * bu güvenle yapılabilir. `afterAll`'da bayrak MUTLAKA `'true'`'ye geri
 * çevrilir (aksi halde bu dosyadan SONRA çalışan diğer TÜM e2e dosyaları
 * — aynı Vitest süreci/`process.env`'i paylaştıklarından, bkz.
 * `vitest.config.ts`'nin `--no-file-parallelism` notu — kendi
 * `registerTestPlayer` çağrılarında yanlışlıkla 429 almaya başlardı).
 */
describe('Rate limiting (e2e)', () => {
  let app: INestApplication;
  let redis: Redis;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    redis = app.get<Redis>(REDIS_CLIENT);

    // Bu test dosyası çalışmadan ÖNCE `DISABLE_RATE_LIMIT: 'true'`
    // altında hiçbir istek Redis sayacını ARTIRMADI (bkz. `RateLimitGuard`
    // — bayrak açıkken `incr` hiç çağrılmaz), ama olası bir yeniden
    // çalıştırmaya karşı (ör. yerel geliştirme, retry) sağlamlık için
    // önceki kalıntı sayaçlar temizlenir.
    const staleKeys = await redis.keys('ratelimit:register:*');
    if (staleKeys.length > 0) {
      await redis.del(...staleKeys);
    }

    process.env.DISABLE_RATE_LIMIT = 'false';
  });

  afterAll(async () => {
    process.env.DISABLE_RATE_LIMIT = 'true';
    const staleKeys = await redis.keys('ratelimit:register:*');
    if (staleKeys.length > 0) {
      await redis.del(...staleKeys);
    }
    await app.close();
  });

  it('/api/v1/players (POST): limit (10/300s) aşıldığında 429 + Retry-After döner, altındaki istekler etkilenmez', async () => {
    // `player.controller.ts`'teki `@RateLimit({ name: 'register', limit: 10, ... })`
    // ile AYNI değer — burada KASITLI olarak sabit yazılır (test,
    // production kodundaki değeri "kopyalamak" yerine GERÇEKTEN GÖZLENEN
    // davranışı doğrular).
    const limit = 10;

    for (let i = 0; i < limit; i += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/players')
        .send({ username: uniqueUsername(), displayName: 'Rate Limit Test' });
      expect(response.status).toBe(201);
    }

    const blockedResponse = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username: uniqueUsername(), displayName: 'Rate Limit Test' });

    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.body.success).toBe(false);
    expect(blockedResponse.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(blockedResponse.headers['retry-after']).toBeDefined();
    expect(Number(blockedResponse.headers['retry-after'])).toBeGreaterThan(0);
  });
});
