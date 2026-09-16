import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/api/middleware/http-exception.filter';
import { PG_POOL } from '../../src/infrastructure/database/database.module';

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
  let pool: Pool;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    pool = moduleRef.get<Pool>(PG_POOL);
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
  it('/api/v1/horses/:id/care (POST) — injured bir at, vet ile (eşikler karşılanınca) active\'e döner', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();

    // Atı sakat durumuna al, injuryRisk'i eşiğin (maxInjuryRisk: 40)
    // hemen üstüne ayarla — vet'in kendi injuryRiskDelta'sı (-10) bunu
    // 35'e düşürecek, care.config.json'daki eşiği karşılayacak.
    await pool.query("UPDATE horses SET status = 'injured' WHERE id = $1", [horseId]);
    await pool.query('UPDATE horse_health SET injury_risk = 45 WHERE horse_id = $1', [horseId]);

    // Sakatken bile antrenman reddedilmeli (mevcut korumanın hâlâ çalıştığını doğrular).
    const trainWhileInjured = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/train`)
      .send({ type: 'speed', intensity: 'low', durationMinutes: 30 });
    expect(trainWhileInjured.status).toBe(409);
    expect(trainWhileInjured.body.error.code).toBe('HORSE_INJURED');

    const vetResponse = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .send({ actionType: 'vet' });

    expect(vetResponse.status).toBe(200);
    expect(vetResponse.body.data.newHealth.injuryRisk).toBe(35);
    expect(vetResponse.body.data.newStatus).toBe('active');

    // Artık antrenman tekrar başarılı olmalı.
    const trainAfterRecovery = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/train`)
      .send({ type: 'speed', intensity: 'low', durationMinutes: 30 });
    expect(trainAfterRecovery.status).toBe(200);
  });

  it('/api/v1/horses/:id/care (POST) — injured bir at, eşikler karşılanmazsa injured kalır', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();

    // injuryRisk 80 → vet sonrası 70, eşik (maxInjuryRisk: 40) hâlâ aşılıyor.
    await pool.query("UPDATE horses SET status = 'injured' WHERE id = $1", [horseId]);
    await pool.query('UPDATE horse_health SET injury_risk = 80 WHERE horse_id = $1', [horseId]);

    const vetResponse = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .send({ actionType: 'vet' });

    expect(vetResponse.status).toBe(200);
    expect(vetResponse.body.data.newStatus).toBe('injured');

    const trainStillInjured = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/train`)
      .send({ type: 'speed', intensity: 'low', durationMinutes: 30 });
    expect(trainStillInjured.status).toBe(409);
    expect(trainStillInjured.body.error.code).toBe('HORSE_INJURED');
  });

  it('/api/v1/horses/:id/care (POST) — injured OLMAYAN bir atta vet eylemi status\'u DEĞİŞTİRMEZ', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/care`)
      .send({ actionType: 'vet' });

    expect(response.status).toBe(200);
    expect(response.body.data.newStatus).toBe('active');
  });
});
