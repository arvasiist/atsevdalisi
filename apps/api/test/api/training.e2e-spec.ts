import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapTestApp, registerTestPlayer, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * FAZ 1 wiring — Dördüncü dilim: `POST /horses/:id/train` (brief §10,
 * docs/API.md §4). `horse.e2e-spec.ts`/`stable.e2e-spec.ts` ile AYNI
 * bootstrap deseni ve AYNI kısıt (GERÇEK PostgreSQL gerektirir, bu
 * ortamda ÇALIŞTIRILAMAZ — bkz. docs/ARCHITECTURE.md §9).
 *
 * AUDIT_REPORT.md Bulgu S2 hardening (bu oturum) — `POST /horses/:id/train`
 * artık `HorseOwnerGuardByParam` ile korunur: istek sahibinin at'ın GERÇEK
 * sahibi olması gerekir, aksi halde 403 (bkz. `training.controller.ts`).
 * Global `AuthGuard` da (bkz. `auth.guard.ts`) her isteğin geçerli bir
 * `Authorization: Bearer <token>` header'ı taşımasını zorunlu kılar — bu
 * yüzden HER istek artık ilgili oyuncunun `authHeader`'ını taşır (bkz.
 * `test-helpers.ts`).
 */
describe('Training (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/horses/:id/train (POST) — geçerli bir antrenman stat/fatigue etkisi üretir', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Antrenör');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/train`)
      .set('Authorization', authHeader)
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
    const horseResponse = await request(app.getHttpServer())
      .get(`/api/v1/horses/${horseId}`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(horseResponse.body.data.fatigue).toBe(response.body.data.newStatus.fatigue);
  });

  it('/api/v1/horses/:id/train (POST) — "rest" türü stat değiştirmez, sadece fatigue düşürür', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Antrenör');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/train`)
      .set('Authorization', authHeader)
      .send({ type: 'rest', intensity: 'low' })
      .expect(200);

    expect(response.body.data.statChanges).toEqual({});
    expect(response.body.data.fatigueGain).toBeLessThan(0);
  });

  it('/api/v1/horses/:id/train (POST) — durationMinutes gönderilmezse varsayılan kullanılır', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Antrenör');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/train`)
      .set('Authorization', authHeader)
      .send({ type: 'stamina', intensity: 'low' })
      .expect(200);

    expect(response.body.success).toBe(true);
  });

  it('/api/v1/horses/:id/train (POST) Authorization header olmadan 401 döner', async () => {
    const { horseId } = await registerTestPlayerWithStarterHorse(app, 'Antrenör');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/train`)
      .send({ type: 'speed', intensity: 'medium' });

    expect(response.status).toBe(401);
  });

  it('/api/v1/horses/:id/train (POST) başkasının atını antrenmana sokmaya çalışan istek 403 döner (AUDIT_REPORT.md S2)', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Gerçek Sahip');
    const attacker = await registerTestPlayer(app, 'Saldırgan');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${owner.horseId}/train`)
      .set('Authorization', attacker.authHeader)
      .send({ type: 'speed', intensity: 'medium' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('/api/v1/horses/:id/train (POST) var olmayan bir at için 404 döner', async () => {
    const someone = await registerTestPlayer(app, 'Herhangi Biri');
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${randomUUID()}/train`)
      .set('Authorization', someone.authHeader)
      .send({ type: 'speed', intensity: 'medium' });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
  });

  it('/api/v1/horses/:id/train (POST) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const someone = await registerTestPlayer(app, 'Herhangi Biri İki');
    const response = await request(app.getHttpServer())
      .post('/api/v1/horses/not-a-uuid/train')
      .set('Authorization', someone.authHeader)
      .send({ type: 'speed', intensity: 'medium' });
    expect(response.status).toBe(400);
  });

  it('/api/v1/horses/:id/train (POST) geçersiz bir tür için 400 döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Antrenör');
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/train`)
      .set('Authorization', authHeader)
      .send({ type: 'not-a-real-type', intensity: 'medium' });
    expect(response.status).toBe(400);
  });

  it('/api/v1/horses/:id/train (POST) çok yorgun bir at için 409 HORSE_TOO_TIRED döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Antrenör');
    // config/training.config.json readinessThresholds.maxFatigueToTrain: 90.
    // "high" yoğunlukta üst üste antrenman ile bu eşiği aşmak için birkaç
    // antrenman gerekir; burada döngüyle fatigue'u eşiğin üzerine çıkarıyoruz.
    let lastStatus = 200;
    for (let i = 0; i < 15 && lastStatus === 200; i += 1) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/horses/${horseId}/train`)
        .set('Authorization', authHeader)
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
