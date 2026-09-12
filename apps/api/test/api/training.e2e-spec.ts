import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/api/middleware/http-exception.filter';

/**
 * FAZ 1 wiring — Dördüncü dilim: `POST /horses/:id/train` (brief §10,
 * docs/API.md §4). `horse.e2e-spec.ts`/`stable.e2e-spec.ts` ile AYNI
 * bootstrap deseni ve AYNI kısıt (GERÇEK PostgreSQL gerektirir, bu
 * ortamda ÇALIŞTIRILAMAZ — bkz. docs/ARCHITECTURE.md §9).
 *
 * ÖNEMLİ (bkz. docs/ARCHITECTURE.md §9.1 Hata 6): `describe`/`it`/`expect`/
 * `beforeAll`/`afterAll` burada AÇIKÇA `vitest`'ten içe aktarılıyor.
 */
describe('Training (e2e)', () => {
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
      .send({ username: uniqueUsername(), displayName: 'Antrenör' })
      .expect(201);
    const playerId = registerResponse.body.data.id;

    const listResponse = await request(app.getHttpServer())
      .get(`/api/v1/horses?ownerId=${playerId}`)
      .expect(200);
    return { horseId: listResponse.body.data[0].id };
  }

  it('/api/v1/horses/:id/train (POST) — geçerli bir antrenman stat/fatigue etkisi üretir', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/train`)
      .send({ type: 'speed', intensity: 'medium' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.horseId).toBe(horseId);
    // Başlangıç atının speed'i 50, potansiyeli 55 (bkz. `createStarterHorse`)
    // — tavana çok yakın olsa da diminishing returns > 0 bir kazanç bırakır.
    expect(response.body.data.statChanges.speed).toBeGreaterThan(0);
    expect(response.body.data.fatigueGain).toBeGreaterThan(0);
    expect(typeof response.body.data.injuryOccurred).toBe('boolean');
    expect(response.body.data.newStatus.fatigue).toBeGreaterThan(0);

    // At artık antrenman öncesinden daha yorgun.
    const horseResponse = await request(app.getHttpServer()).get(`/api/v1/horses/${horseId}`).expect(200);
    expect(horseResponse.body.data.fatigue).toBe(response.body.data.newStatus.fatigue);
  });

  it('/api/v1/horses/:id/train (POST) — "rest" türü stat değiştirmez, sadece fatigue düşürür', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/train`)
      .send({ type: 'rest', intensity: 'low' })
      .expect(200);

    expect(response.body.data.statChanges).toEqual({});
    expect(response.body.data.fatigueGain).toBeLessThan(0);
  });

  it('/api/v1/horses/:id/train (POST) — durationMinutes gönderilmezse varsayılan kullanılır', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/train`)
      .send({ type: 'stamina', intensity: 'low' })
      .expect(200);

    expect(response.body.success).toBe(true);
  });

  it('/api/v1/horses/:id/train (POST) var olmayan bir at için 404 döner', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${randomUUID()}/train`)
      .send({ type: 'speed', intensity: 'medium' });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
  });

  it('/api/v1/horses/:id/train (POST) geçersiz bir tür için 400 döner', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/train`)
      .send({ type: 'not-a-real-type', intensity: 'medium' });
    expect(response.status).toBe(400);
  });

  it('/api/v1/horses/:id/train (POST) çok yorgun bir at için 409 HORSE_TOO_TIRED döner', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();
    // config/training.config.json readinessThresholds.maxFatigueToTrain: 90.
    // "high" yoğunlukta üst üste antrenman ile bu eşiği aşmak için birkaç
    // antrenman gerekir; burada döngüyle fatigue'u eşiğin üzerine çıkarıyoruz.
    let lastStatus = 200;
    for (let i = 0; i < 15 && lastStatus === 200; i += 1) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/train`)
        .send({ type: 'sprint', intensity: 'high', durationMinutes: 60 });
      lastStatus = response.status;
      if (lastStatus !== 200) {
        expect(lastStatus).toBe(409);
        expect(['HORSE_TOO_TIRED', 'HORSE_INJURED']).toContain(response.body.error.code);
        return;
      }
    }
    throw new Error('Beklenen 409 yanıtı hiç alınmadı — fatigue eşiği aşılamadı.');
  });
});
