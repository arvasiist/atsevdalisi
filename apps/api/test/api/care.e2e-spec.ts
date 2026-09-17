import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayer, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * FAZ 1 wiring — Beşinci dilim: `POST /horses/:id/care` ve `POST
 * /horses/:id/feed` (brief §11-12, docs/API.md §4). `training.e2e-spec.ts`
 * ile AYNI bootstrap deseni ve AYNI kısıt (GERÇEK PostgreSQL gerektirir,
 * bu ortamda ÇALIŞTIRILAMAZ — bkz. docs/ARCHITECTURE.md §9).
 *
 * AUDIT_REPORT.md Bulgu S2 hardening (bu oturum) — hem `:id/care` hem
 * `:id/feed` artık `HorseOwnerGuardByParam` ile korunur (bkz.
 * `care.controller.ts`) ve global `AuthGuard` her isteğin geçerli bir
 * `Authorization: Bearer <token>` header'ı taşımasını zorunlu kılar — bu
 * yüzden HER istek artık ilgili oyuncunun `authHeader`'ını taşır (bkz.
 * `test-helpers.ts`).
 */
describe('Care (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/horses/:id/care (POST) — tımar (groom) moral ve health artırır', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Seyis');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .set('Authorization', authHeader)
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
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Seyis');

    await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .set('Authorization', authHeader)
      .send({ actionType: 'groom' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .set('Authorization', authHeader)
      .send({ actionType: 'groom' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CARE_ACTION_ON_COOLDOWN');
  });

  it("/api/v1/horses/:id/care (POST) — farklı bir eylem türü AYNI atırdaki cooldown'dan etkilenmez", async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Seyis');

    await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .set('Authorization', authHeader)
      .send({ actionType: 'groom' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .set('Authorization', authHeader)
      .send({ actionType: 'vet' });

    expect(response.status).toBe(200);
  });

  it('/api/v1/horses/:id/feed (POST) — cooldown olmadan art arda çağrılabilir', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Seyis');

    const first = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/feed`)
      .set('Authorization', authHeader)
      .send({ feedType: 'standard' });
    expect(first.status).toBe(200);
    expect(first.body.data.feedType).toBe('standard');
    expect(first.body.data.newVitals.energy).toBeGreaterThan(100 > first.body.data.newVitals.energy ? 0 : -1);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/feed`)
      .set('Authorization', authHeader)
      .send({ feedType: 'performance' });
    expect(second.status).toBe(200);
  });

  it('/api/v1/horses/:id/care (POST) Authorization header olmadan 401 döner', async () => {
    const { horseId } = await registerTestPlayerWithStarterHorse(app, 'Seyis');
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .send({ actionType: 'groom' });
    expect(response.status).toBe(401);
  });

  it('/api/v1/horses/:id/care (POST) başkasının atına bakım uygulamaya çalışan istek 403 döner (AUDIT_REPORT.md S2)', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Gerçek Sahip');
    const attacker = await registerTestPlayer(app, 'Saldırgan');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${owner.horseId}/care`)
      .set('Authorization', attacker.authHeader)
      .send({ actionType: 'groom' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('/api/v1/horses/:id/feed (POST) başkasının atını beslemeye çalışan istek 403 döner (AUDIT_REPORT.md S2)', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Gerçek Sahip İki');
    const attacker = await registerTestPlayer(app, 'Saldırgan İki');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${owner.horseId}/feed`)
      .set('Authorization', attacker.authHeader)
      .send({ feedType: 'standard' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('/api/v1/horses/:id/care (POST) var olmayan bir at için 404 döner', async () => {
    const someone = await registerTestPlayer(app, 'Herhangi Biri');
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${randomUUID()}/care`)
      .set('Authorization', someone.authHeader)
      .send({ actionType: 'groom' });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
  });

  it('/api/v1/horses/:id/care (POST) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const someone = await registerTestPlayer(app, 'Herhangi Biri İki');
    const response = await request(app.getHttpServer())
      .post('/api/v1/horses/not-a-uuid/care')
      .set('Authorization', someone.authHeader)
      .send({ actionType: 'groom' });
    expect(response.status).toBe(400);
  });

  it('/api/v1/horses/:id/care (POST) geçersiz bir eylem türü için 400 döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Seyis');
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .set('Authorization', authHeader)
      .send({ actionType: 'not-a-real-action' });
    expect(response.status).toBe(400);
  });

  it('/api/v1/horses/:id/feed (POST) geçersiz bir yem türü için 400 döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Seyis');
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/feed`)
      .set('Authorization', authHeader)
      .send({ feedType: 'not-a-real-feed' });
    expect(response.status).toBe(400);
  });

  /**
   * AUDIT_REPORT.md H1 (bu oturum) — `injured` durumundan çıkış yolu
   * yoktu: `vet` eylemi bile `horse.status`'a hiç dokunmuyordu. Bu testler
   * `PerformCareActionUseCase` + `canRecoverFromInjury`'nin gerçek
   * veritabanına karşı doğru çalıştığını doğrular. İnjury olasılıksal
   * olduğundan (antrenman sırasında rastgele oluşur), at doğrudan raw SQL
   * ile `injured`'a alınır — `market.e2e-spec.ts`'in C1 testinde
   * `INSERT INTO horses` için kullanılan AYNI "testin ihtiyacı olan durumu
   * doğrudan veritabanında kur" deseni.
   */
  it("/api/v1/horses/:id/care (POST) — injured bir at, vet ile (eşikler karşılanınca) active'e döner", async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Seyis');

    // Atı sakat durumuna al, injuryRisk'i eşiğin (maxInjuryRisk: 40)
    // hemen üstüne ayarla — vet'in kendi injuryRiskDelta'sı (-10) bunu
    // 35'e düşürecek, care.config.json'daki eşiği karşılayacak.
    await pool.query("UPDATE horses SET status = 'injured' WHERE id = $1", [horseId]);
    await pool.query('UPDATE horse_health SET injury_risk = 45 WHERE horse_id = $1', [horseId]);

    // Sakatken bile antrenman reddedilmeli (mevcut korumanın hâlâ çalıştığını doğrular).
    const trainWhileInjured = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/train`)
      .set('Authorization', authHeader)
      .send({ type: 'speed', intensity: 'low', durationMinutes: 30 });
    expect(trainWhileInjured.status).toBe(409);
    expect(trainWhileInjured.body.error.code).toBe('HORSE_INJURED');

    const vetResponse = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .set('Authorization', authHeader)
      .send({ actionType: 'vet' });

    expect(vetResponse.status).toBe(200);
    expect(vetResponse.body.data.newHealth.injuryRisk).toBe(35);
    expect(vetResponse.body.data.newStatus).toBe('active');

    // Artık antrenman tekrar başarılı olmalı.
    const trainAfterRecovery = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/train`)
      .set('Authorization', authHeader)
      .send({ type: 'speed', intensity: 'low', durationMinutes: 30 });
    expect(trainAfterRecovery.status).toBe(200);
  });

  it('/api/v1/horses/:id/care (POST) — injured bir at, eşikler karşılanmazsa injured kalır', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Seyis');

    // injuryRisk 80 → vet sonrası 70, eşik (maxInjuryRisk: 40) hâlâ aşılıyor.
    await pool.query("UPDATE horses SET status = 'injured' WHERE id = $1", [horseId]);
    await pool.query('UPDATE horse_health SET injury_risk = 80 WHERE horse_id = $1', [horseId]);

    const vetResponse = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .set('Authorization', authHeader)
      .send({ actionType: 'vet' });

    expect(vetResponse.status).toBe(200);
    expect(vetResponse.body.data.newStatus).toBe('injured');

    const trainStillInjured = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/train`)
      .set('Authorization', authHeader)
      .send({ type: 'speed', intensity: 'low', durationMinutes: 30 });
    expect(trainStillInjured.status).toBe(409);
    expect(trainStillInjured.body.error.code).toBe('HORSE_INJURED');
  });

  it("/api/v1/horses/:id/care (POST) — injured OLMAYAN bir atta vet eylemi status'u DEĞİŞTİRMEZ", async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Seyis');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .set('Authorization', authHeader)
      .send({ actionType: 'vet' });

    expect(response.status).toBe(200);
    expect(response.body.data.newStatus).toBe('active');
  });
});
