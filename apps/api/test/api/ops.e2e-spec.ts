import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadOpsConfig } from '@at-sevdalisi/game-config';
import { ErrorCode } from '@at-sevdalisi/shared-types';
import { REDIS_CLIENT } from '../../src/infrastructure/redis/redis.module';
import { bootstrapTestApp, registerTestPlayer } from './test-helpers';

/**
 * Faz 13-A (02.10.2026) — işletim uçları.
 * - `/health/ready` gerçek PostgreSQL + Redis'i denetler; biri düşükse 503
 *   ve hata ayrıntısı yanıta GİRMEZ.
 * - Her yanıt `X-Request-Id` taşır; hata zarfı aynı kimliği taşır.
 * - Cüzdan, para yatırmanın açık olup olmadığını sunucudan söyler.
 */
describe('İşletim: hazırlık + istek kimliği (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health/ready: veritabanı ve Redis ayakta → 200', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', checks: { database: 'ok', redis: 'ok' } });
  });

  it('/health canlılık ucu bağımlılık sorgulamaz ve değişmedi', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'at-sevdalisi-api' });
  });

  it('geçerli X-Request-Id geri yansır; hata zarfı aynı kimliği taşır', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/players/00000000-0000-0000-0000-000000000000')
      .set('X-Request-Id', 'lb-izleme-42')
      .expect(401);
    expect(response.headers['x-request-id']).toBe('lb-izleme-42');
    expect(response.body.error).toMatchObject({ code: ErrorCode.Unauthorized, requestId: 'lb-izleme-42' });
  });

  it('bozuk/eksik X-Request-Id yerine sunucu kimlik üretir; başarılı yanıtta da başlık var', async () => {
    const bad = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', 'kötü kimlik\twith tab')
      .expect(200);
    expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const missing = await request(app.getHttpServer()).get('/api/v1/yok-boyle-bir-uc').expect(404);
    expect(missing.body.error.requestId).toBe(missing.headers['x-request-id']);
  });

  it('cüzdan para yatırmanın açık olduğunu sunucudan söyler (test ortamı: açık)', async () => {
    const player = await registerTestPlayer(app, 'Cüzdan Bayrak');
    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${player.playerId}/wallet`)
      .set('Authorization', player.authHeader)
      .expect(200);
    expect(response.body.data.depositAvailable).toBe(true);
  });
});

describe('İşletim: Redis düşükken hazırlık (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Yalnızca PING'i bozan sahte istemci; açılış/kapanışta çağrılanlar zararsız.
    const brokenRedis = {
      ping: () => new Promise(() => undefined),
      quit: async () => 'OK',
      disconnect: () => undefined,
      on: () => brokenRedis,
    };
    app = await bootstrapTestApp((builder) => builder.overrideProvider(REDIS_CLIENT).useValue(brokenRedis));
  });

  afterAll(async () => {
    await app.close();
  });

  it('PING yanıt vermezse zaman aşımıyla 503; ayrıntı sızmaz', async () => {
    const started = Date.now();
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    expect(response.body).toMatchObject({ status: 'degraded', checks: { database: 'ok', redis: 'error' } });
    expect(JSON.stringify(response.body)).not.toMatch(/zaman aşımı|ECONN|redis:\/\//);
    expect(Date.now() - started).toBeGreaterThanOrEqual(loadOpsConfig().readiness.checkTimeoutMs - 50);
  });
});
