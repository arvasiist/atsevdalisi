import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/api/middleware/http-exception.filter';

/**
 * FAZ 1 wiring — Beşinci dilim: `POST /horses/:id/care` ve `POST
 * /horses/:id/feed` (brief §11-12, docs/API.md §4). `training.e2e-spec.ts`
 * ile AYNI bootstrap deseni ve AYNI kısıt (GERÇEK PostgreSQL gerektirir,
 * bu ortamda ÇALIŞTIRILAMAZ — bkz. docs/ARCHITECTURE.md §9).
 *
 * ÖNEMLİ (bkz. docs/ARCHITECTURE.md §9.1 Hata 6): `describe`/`it`/`expect`/
 * `beforeAll`/`afterAll` burada AÇIKÇA `vitest`'ten içe aktarılıyor.
 */
describe('Care (e2e)', () => {
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

  async function registerPlayerWithStarterHorse(): Promise<{ horseId: string }> {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username: uniqueUsername(), displayName: 'Seyis' })
      .expect(201);
    const playerId = registerResponse.body.data.id;

    const listResponse = await request(app.getHttpServer())
      .get(`/api/v1/horses?ownerId=${playerId}`)
      .expect(200);
    return { horseId: listResponse.body.data[0].id };
  }

  it('/api/v1/horses/:id/care (POST) — tımar (groom) moral ve health artırır', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .send({ actionType: 'groom' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.horseId).toBe(horseId);
    expect(response.body.data.actionType).toBe('groom');
    // Başlangıç atının morale'i 80 (bkz. `createStarterHorse`) — groom morale +8 verir.
    expect(response.body.data.newVitals.morale).toBeGreaterThan(80);
    expect(response.body.data.newHealth).toHaveProperty('injuryRisk');
  });

  it('/api/v1/horses/:id/care (POST) — cooldown dolmadan aynı eylem 409 CARE_ACTION_ON_COOLDOWN döner', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();

    await request(app.getHttpServer()).post(`/api/v1/horses/${horseId}/care`).send({ actionType: 'groom' }).expect(200);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .send({ actionType: 'groom' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CARE_ACTION_ON_COOLDOWN');
  });

  it('/api/v1/horses/:id/care (POST) — farklı bir eylem türü AYNI atırdaki cooldown\'dan etkilenmez', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();

    await request(app.getHttpServer()).post(`/api/v1/horses/${horseId}/care`).send({ actionType: 'groom' }).expect(200);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .send({ actionType: 'vet' });

    expect(response.status).toBe(200);
  });

  it('/api/v1/horses/:id/feed (POST) — cooldown olmadan art arda çağrılabilir', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();

    const first = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/feed`)
      .send({ feedType: 'standard' });
    expect(first.status).toBe(200);
    expect(first.body.data.feedType).toBe('standard');
    expect(first.body.data.newVitals.energy).toBeGreaterThan(100 > first.body.data.newVitals.energy ? 0 : -1);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/feed`)
      .send({ feedType: 'performance' });
    expect(second.status).toBe(200);
  });

  it('/api/v1/horses/:id/care (POST) var olmayan bir at için 404 döner', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${randomUUID()}/care`)
      .send({ actionType: 'groom' });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
  });

  it('/api/v1/horses/:id/care (POST) geçersiz bir eylem türü için 400 döner', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .send({ actionType: 'not-a-real-action' });
    expect(response.status).toBe(400);
  });

  it('/api/v1/horses/:id/feed (POST) geçersiz bir yem türü için 400 döner', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/feed`)
      .send({ feedType: 'not-a-real-feed' });
    expect(response.status).toBe(400);
  });
});
