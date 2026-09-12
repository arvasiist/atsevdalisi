import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/api/middleware/http-exception.filter';

/**
 * FAZ 1 wiring — Üçüncü dilim: `GET /players/:id/stable-summary` (brief
 * §38 "Ahır Özeti"). `player.e2e-spec.ts`/`horse.e2e-spec.ts` ile AYNI
 * bootstrap deseni ve AYNI kısıt (GERÇEK PostgreSQL gerektirir, bu
 * ortamda ÇALIŞTIRILAMAZ — bkz. docs/ARCHITECTURE.md §9).
 *
 * ÖNEMLİ (bkz. docs/ARCHITECTURE.md §9.1 Hata 6): `describe`/`it`/`expect`/
 * `beforeAll`/`afterAll` burada AÇIKÇA `vitest`'ten içe aktarılıyor.
 */
describe('Stable summary (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function uniqueUsername(): string {
    return `test_${randomUUID().replace(/-/g, '')}`.slice(0, 20);
  }

  it('/api/v1/players/:id/stable-summary (GET) — yeni oyuncu için doğru başlangıç özetini döner', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username: uniqueUsername(), displayName: 'Ahır Sahibi' })
      .expect(201);
    const playerId = registerResponse.body.data.id;

    const response = await request(app.getHttpServer()).get(`/api/v1/players/${playerId}/stable-summary`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    // config/stable.config.json: seviye 1 -> kapasite 5.
    expect(response.body.data.stableLevel).toBe(1);
    expect(response.body.data.capacity).toBe(5);
    // Kayıtta verilen başlangıç atı (health:100, fitness:50) -> ortalama 75.
    expect(response.body.data.horseCount).toBe(1);
    expect(response.body.data.averageCondition).toBe(75);
    // Başlangıç atının sağlığı (100) uyarı eşiğinin (50) üzerinde.
    expect(response.body.data.healthWarnings).toEqual([]);
  });

  it('/api/v1/players/:id/stable-summary (GET) var olmayan bir oyuncu için 404 döner', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/players/${randomUUID()}/stable-summary`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PLAYER_NOT_FOUND');
  });

  it('/api/v1/players/:id/stable-summary (GET) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/players/not-a-uuid/stable-summary');
    expect(response.status).toBe(400);
  });
});
