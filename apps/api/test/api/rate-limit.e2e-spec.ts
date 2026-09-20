import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REDIS_CLIENT } from '../../src/infrastructure/redis/redis.module';
import { bootstrapTestApp, registerTestPlayer, uniqueUsername } from './test-helpers';

/**
 * AUDIT_REPORT.md Bulgu S5 (High) hardening (bu oturum, iki dilim) —
 * `RateLimitGuard` (bkz. `apps/api/src/api/rate-limit/rate-limit.guard.ts`)
 * üç rotayı sınırlar: `POST /players` (kayıt, `keyBy: 'ip'`),
 * `POST /auth/login` (giriş, `keyBy: 'ip'`) ve, ikinci dilimde eklenen,
 * `POST /market/listings/:id/buy` (satın alma, `keyBy: 'player'`) ve
 * `POST /players/:id/daily-reward` (ödül talebi, `keyBy: 'player'`).
 *
 * ÖNEMLİ — bu dosya `.github/workflows/ci.yml`'nin `DISABLE_RATE_LIMIT:
 * 'true'` bayrağını (TÜM diğer e2e dosyalarının — yalnızca kayıt/giriş
 * DEĞİL, `stable.e2e-spec.ts`'in n=100 FARKLI-Idempotency-Key testi gibi
 * ekonomi uçlarını da hedefleyenlerin — bu limitlere TAKILMAMASI için
 * ayarlanır, bkz. o dosyanın doc yorumu) KENDİ İÇİNDE, YALNIZCA bu
 * `describe` bloğu çalışırken `process.env.DISABLE_RATE_LIMIT`'i
 * `'false'`'e çevirerek GEÇİCİ olarak devre dışı bırakır — `RateLimitGuard`
 * bu bayrağı HER istekte (önbelleğe almadan, bkz. o guard'ın doc yorumu)
 * canlı okuduğundan bu güvenle yapılabilir. `afterAll`'da bayrak MUTLAKA
 * `'true'`'ye geri çevrilir (aksi halde bu dosyadan SONRA çalışan diğer
 * TÜM e2e dosyaları — aynı Vitest süreci/`process.env`'i paylaştıklarından,
 * bkz. `vitest.config.ts`'nin `--no-file-parallelism` notu — kendi
 * çağrılarında yanlışlıkla 429 almaya başlardı).
 */
describe('Rate limiting (e2e)', () => {
  let app: INestApplication;
  let redis: Redis;
  let marketPlayer: Awaited<ReturnType<typeof registerTestPlayer>>;
  let dailyRewardPlayer: Awaited<ReturnType<typeof registerTestPlayer>>;

  const ALL_RATE_LIMIT_KEY_PATTERNS = ['ratelimit:register:*', 'ratelimit:login:*', 'ratelimit:market-buy:*', 'ratelimit:daily-reward:*'];

  async function clearRateLimitKeys(): Promise<void> {
    for (const pattern of ALL_RATE_LIMIT_KEY_PATTERNS) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  }

  beforeAll(async () => {
    app = await bootstrapTestApp();
    redis = app.get<Redis>(REDIS_CLIENT);

    // Bu test dosyası çalışmadan ÖNCE `DISABLE_RATE_LIMIT: 'true'`
    // altında hiçbir istek Redis sayacını ARTIRMADI (bkz. `RateLimitGuard`
    // — bayrak açıkken `incr` hiç çağrılmaz), ama olası bir yeniden
    // çalıştırmaya karşı (ör. yerel geliştirme, retry) sağlamlık için
    // önceki kalıntı sayaçlar temizlenir.
    await clearRateLimitKeys();

    // ÖNEMLİ — market-buy/daily-reward testlerinin ihtiyaç duyduğu
    // oyuncular BAYRAK HÂLÂ `'true'` iken (yani `POST /players` limitine
    // TABİ OLMADAN) burada kaydedilir. Aksi halde register testinin
    // KENDİSİ (aşağıda) limiti (10/300s) tüketir ve SONRAKİ testlerin
    // `registerTestPlayer` çağrıları da 429 alıp `.expect(201)` ile
    // BAŞARISIZ olurdu — aynı IP'den, AYNI Vitest sürecinde sırayla
    // çalıştıklarından (bkz. dosya doc yorumu).
    marketPlayer = await registerTestPlayer(app, 'Rate Limit Test (Market)');
    dailyRewardPlayer = await registerTestPlayer(app, 'Rate Limit Test (Daily Reward)');

    process.env.DISABLE_RATE_LIMIT = 'false';
  });

  afterAll(async () => {
    process.env.DISABLE_RATE_LIMIT = 'true';
    await clearRateLimitKeys();
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

  it('/api/v1/market/listings/:id/buy (POST): oyuncu bazlı limit (20/60s) aşıldığında 429 döner', async () => {
    // `market.controller.ts`'teki `@RateLimit({ name: 'market-buy', limit: 20, ... })`
    // ile AYNI değer. `RateLimitGuard` rota handler'ından (dolayısıyla
    // `id`'nin GERÇEK bir ilana ait olup olmadığı kontrolünden) ÖNCE
    // çalıştığından, var OLMAYAN bir listing id'siyle bile sayaç doğru
    // şekilde artar — bu test yalnızca GUARD'ın davranışını doğruluyor,
    // gerçek bir satın almayı DEĞİL (bkz. `market.e2e-spec.ts`'in kendi
    // satın alma testleri).
    const limit = 20;

    for (let i = 0; i < limit; i += 1) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/market/listings/${randomUUID()}/buy`)
        .set('Authorization', marketPlayer.authHeader)
        .set('Idempotency-Key', randomUUID());
      // Var olmayan bir ilan için 404 bekleniyor — guard bu noktaya
      // ULAŞILMASINA zaten izin verdi, önemli olan 429 OLMAMASI.
      expect(response.status).not.toBe(429);
    }

    const blockedResponse = await request(app.getHttpServer())
      .post(`/api/v1/market/listings/${randomUUID()}/buy`)
      .set('Authorization', marketPlayer.authHeader)
      .set('Idempotency-Key', randomUUID());

    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(blockedResponse.headers['retry-after']).toBeDefined();
  });

  it('/api/v1/players/:id/daily-reward (POST): oyuncu bazlı limit (5/60s) aşıldığında 429 döner', async () => {
    // `economy.controller.ts`'teki `@RateLimit({ name: 'daily-reward', limit: 5, ... })`
    // ile AYNI değer. İlk istek GERÇEKTEN 200 döner (ödül henüz
    // talep edilmemiş), kalanlar kendi cooldown kuralıyla 409
    // `DAILY_REWARD_ALREADY_CLAIMED` döner — guard için ikisi de "429
    // DEĞİL" sayılır, testin ilgilendiği tek şey budur.
    const limit = 5;

    for (let i = 0; i < limit; i += 1) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/players/${dailyRewardPlayer.playerId}/daily-reward`)
        .set('Authorization', dailyRewardPlayer.authHeader);
      expect(response.status).not.toBe(429);
    }

    const blockedResponse = await request(app.getHttpServer())
      .post(`/api/v1/players/${dailyRewardPlayer.playerId}/daily-reward`)
      .set('Authorization', dailyRewardPlayer.authHeader);

    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(blockedResponse.headers['retry-after']).toBeDefined();
  });
});
