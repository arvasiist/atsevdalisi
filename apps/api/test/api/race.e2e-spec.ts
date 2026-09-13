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
 * FAZ 1 wiring — Sekizinci dilim: `POST /horses/:id/practice-race`
 * (brief §6 Race Engine, docs/API.md §4). `training.e2e-spec.ts`/
 * `care.e2e-spec.ts` ile AYNI bootstrap deseni ve AYNI kısıt (GERÇEK
 * PostgreSQL gerektirir, bu ortamda ÇALIŞTIRILAMAZ — bkz.
 * docs/ARCHITECTURE.md §9).
 *
 * ÖNEMLİ (bkz. docs/ARCHITECTURE.md §9.1 Hata 6): `describe`/`it`/`expect`/
 * `beforeAll`/`afterAll` burada AÇIKÇA `vitest`'ten içe aktarılıyor.
 */
describe('Race — Pratik Yarış (e2e)', () => {
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

    // "Sakatlanmış at yarışamaz" senaryosu doğal yoldan tetiklenmesi zor
    // (antrenman sakatlık riski deterministik değil) — uygulamanın kendi
    // DB havuzu üzerinden DOĞRUDAN ayarlanır. `stable.e2e-spec.ts`'teki
    // AYNI teknik: gerçek bir kullanıcı akışı DEĞİL, yalnızca test kurulumu.
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
      .send({ username: uniqueUsername(), displayName: 'Yarışçı' })
      .expect(201);
    const playerId = registerResponse.body.data.id;

    const listResponse = await request(app.getHttpServer()).get(`/api/v1/horses?ownerId=${playerId}`).expect(200);
    return { horseId: listResponse.body.data[0].id };
  }

  it('/api/v1/horses/:id/practice-race (POST) — varsayılan taktikle bir yarış çalıştırır ve TÜM katılımcılarla sonuç döner', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();

    const response = await request(app.getHttpServer()).post(`/api/v1/horses/${horseId}/practice-race`).send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.horseId).toBe(horseId);
    expect(typeof response.body.data.raceId).toBe('string');
    expect(response.body.data.surface).toBe('grass');
    expect(response.body.data.weather).toBe('sunny');
    // config/race.config.json PRACTICE_RACE_BOT_COUNT (5) + oyuncunun atı = 6.
    expect(response.body.data.finalResult).toHaveLength(6);
    expect(response.body.data.explanations).toHaveLength(6);

    const playerFinish = response.body.data.finalResult.find((entry: { horseId: string }) => entry.horseId === horseId);
    expect(playerFinish).toBeDefined();
    expect(playerFinish.finishPosition).toBeGreaterThanOrEqual(1);
    expect(playerFinish.finishPosition).toBeLessThanOrEqual(6);
    expect(typeof playerFinish.finishTimeMs).toBe('number');
  });

  it('/api/v1/horses/:id/practice-race (POST) — açık bir taktik seçimini kabul eder', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .send({ racingStyle: 'front_runner', riskLevel: 'high', startApproach: 'aggressive', finalStretchPlan: 'early_sprint' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('/api/v1/horses/:id/practice-race (POST) — sonucu races/race_entries tablolarına gerçekten yazar', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();

    const response = await request(app.getHttpServer()).post(`/api/v1/horses/${horseId}/practice-race`).send({}).expect(200);
    const { raceId } = response.body.data;

    const raceRow = await pool.query('SELECT * FROM races WHERE id = $1', [raceId]);
    expect(raceRow.rows).toHaveLength(1);
    expect(raceRow.rows[0].status).toBe('finished');

    const entryRow = await pool.query('SELECT * FROM race_entries WHERE race_id = $1 AND horse_id = $2', [raceId, horseId]);
    expect(entryRow.rows).toHaveLength(1);
    expect(entryRow.rows[0].finish_position).not.toBeNull();

    const segmentRows = await pool.query('SELECT * FROM race_entry_segments WHERE race_entry_id = $1', [entryRow.rows[0].id]);
    expect(segmentRows.rows.length).toBeGreaterThan(0);
  });

  it('/api/v1/horses/:id/practice-race (POST) sakatlanmış bir at için 409 HORSE_INJURED döner', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();
    await pool.query("UPDATE horses SET status = 'injured' WHERE id = $1", [horseId]);

    const response = await request(app.getHttpServer()).post(`/api/v1/horses/${horseId}/practice-race`).send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('HORSE_INJURED');
  });

  it('/api/v1/horses/:id/practice-race (POST) var olmayan bir at için 404 döner', async () => {
    const response = await request(app.getHttpServer()).post(`/api/v1/horses/${randomUUID()}/practice-race`).send({});
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
  });

  it('/api/v1/horses/:id/practice-race (POST) geçersiz bir yarış stili için 400 döner', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .send({ racingStyle: 'not-a-real-style' });
    expect(response.status).toBe(400);
  });

  it('/api/v1/horses/:id/practice-race (POST) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/horses/not-a-uuid/practice-race').send({});
    expect(response.status).toBe(400);
  });
});
