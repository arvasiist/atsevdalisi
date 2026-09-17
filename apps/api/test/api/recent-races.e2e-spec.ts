import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/api/middleware/http-exception.filter';

/**
 * Faz 2 (görsel kalite planı) — Ana Sayfa "Son Yarış Sonuçları" paneli:
 * `GET /players/:id/recent-races`. `stable.e2e-spec.ts`/`race.e2e-spec.ts`
 * ile AYNI bootstrap deseni ve AYNI kısıt (GERÇEK PostgreSQL + Redis
 * gerektirir — `RedisModule` `@Global()` olduğundan `RaceModule` zaten
 * Redis'e bağımlı, bkz. `race.e2e-spec.ts` doc yorumu; bu ortamda
 * ÇALIŞTIRILAMAZ — bkz. docs/ARCHITECTURE.md §9).
 *
 * ÖNEMLİ (bkz. docs/ARCHITECTURE.md §9.1 Hata 6): `describe`/`it`/`expect`/
 * `beforeAll`/`afterAll` burada AÇIKÇA `vitest`'ten içe aktarılıyor.
 */
describe('Recent races — Ana Sayfa "Son Yarış Sonuçları" (e2e)', () => {
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

  async function registerPlayerWithStarterHorse(): Promise<{ horseId: string; playerId: string }> {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username: uniqueUsername(), displayName: 'Yarışçı' })
      .expect(201);
    const playerId = registerResponse.body.data.id;

    const listResponse = await request(app.getHttpServer()).get(`/api/v1/horses?ownerId=${playerId}`).expect(200);
    return { horseId: listResponse.body.data[0].id, playerId };
  }

  it('/api/v1/players/:id/recent-races (GET) — hiç yarış koşmamış bir oyuncu için boş dizi döner', async () => {
    const { playerId } = await registerPlayerWithStarterHorse();

    const response = await request(app.getHttpServer()).get(`/api/v1/players/${playerId}/recent-races`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual([]);
  });

  it('/api/v1/players/:id/recent-races (GET) — pratik yarış sonrası sonucu gerçek verilerle döner', async () => {
    const { horseId, playerId } = await registerPlayerWithStarterHorse();

    const raceResponse = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);

    const response = await request(app.getHttpServer()).get(`/api/v1/players/${playerId}/recent-races`).expect(200);

    expect(response.body.data).toHaveLength(1);
    const entry = response.body.data[0];
    expect(entry.raceId).toBe(raceResponse.body.data.raceId);
    expect(entry.horseId).toBe(horseId);
    expect(typeof entry.horseName).toBe('string');
    expect(entry.horseName.length).toBeGreaterThan(0);
    expect(entry.distanceMeters).toBe(raceResponse.body.data.distanceMeters);
    expect(entry.surface).toBe(raceResponse.body.data.surface);
    expect(typeof entry.finishPosition).toBe('number');
    expect(typeof entry.finalTimeMs).toBe('number');
    expect(typeof entry.performanceScore).toBe('number');
    expect(typeof entry.finishedAt).toBe('string');

    const playerFinish = raceResponse.body.data.finalResult.find(
      (finish: { horseId: string }) => finish.horseId === horseId,
    );
    expect(entry.finishPosition).toBe(playerFinish.finishPosition);
    expect(entry.finalTimeMs).toBe(playerFinish.finishTimeMs);
  });

  it('/api/v1/players/:id/recent-races (GET) — en yeni yarış listenin başında döner ve limit parametresine uyar', async () => {
    const { horseId, playerId } = await registerPlayerWithStarterHorse();

    const firstRace = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    const secondRace = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${playerId}/recent-races?limit=1`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].raceId).toBe(secondRace.body.data.raceId);
    expect(response.body.data[0].raceId).not.toBe(firstRace.body.data.raceId);
  });

  it('/api/v1/players/:id/recent-races (GET) var olmayan bir oyuncu için 404 döner', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/players/${randomUUID()}/recent-races`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PLAYER_NOT_FOUND');
  });

  it('/api/v1/players/:id/recent-races (GET) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/players/not-a-uuid/recent-races');
    expect(response.status).toBe(400);
  });
});
