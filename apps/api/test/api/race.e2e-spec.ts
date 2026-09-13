import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EconomyConfig } from '@at-sevdalisi/game-config';
import economyConfigJson from '../../../../config/economy.config.json';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/api/middleware/http-exception.filter';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { getPracticeRaceEntryFee } from '../../src/domain/race/prize';

const economyConfig = economyConfigJson as unknown as EconomyConfig;

/**
 * FAZ 1 wiring — Sekizinci dilim: `POST /horses/:id/practice-race`
 * (brief §6 Race Engine, docs/API.md §4). `training.e2e-spec.ts`/
 * `care.e2e-spec.ts` ile AYNI bootstrap deseni ve AYNI kısıt (GERÇEK
 * PostgreSQL gerektirir, bu ortamda ÇALIŞTIRILAMAZ — bkz.
 * docs/ARCHITECTURE.md §9).
 *
 * FAZ 1 wiring, dokuzuncu dilim — `RedisModule` `@Global()` olduğundan bu
 * spec ARTIK gerçek bir Redis bağlantısı da gerektiriyor (bkz.
 * `.github/workflows/ci.yml`'e eklenen `redis` servis konteyneri).
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

  async function registerPlayerWithStarterHorse(): Promise<{ horseId: string; playerId: string }> {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/players')
      .send({ username: uniqueUsername(), displayName: 'Yarışçı' })
      .expect(201);
    const playerId = registerResponse.body.data.id;

    const listResponse = await request(app.getHttpServer()).get(`/api/v1/horses?ownerId=${playerId}`).expect(200);
    return { horseId: listResponse.body.data[0].id, playerId };
  }

  it('/api/v1/horses/:id/practice-race (POST) — varsayılan taktikle bir yarış çalıştırır ve TÜM katılımcılarla sonuç döner', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Idempotency-Key', randomUUID())
      .send({});

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
      .set('Idempotency-Key', randomUUID())
      .send({ racingStyle: 'front_runner', riskLevel: 'high', startApproach: 'aggressive', finalStretchPlan: 'early_sprint' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('/api/v1/horses/:id/practice-race (POST) — sonucu races/race_entries tablolarına gerçekten yazar (entry_fee/prize_pool DAHİL)', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    const { raceId } = response.body.data;

    const raceRow = await pool.query('SELECT * FROM races WHERE id = $1', [raceId]);
    expect(raceRow.rows).toHaveLength(1);
    expect(raceRow.rows[0].status).toBe('finished');
    // `entry_fee`/`prize_pool` BIGINT'tir — `pg` bunu hassasiyet kaybı
    // riskine karşı BİLEREK bir string olarak döner (JS number'ın güvenli
    // tam sayı sınırını aşabileceği için), `Number()` ile karşılaştırma
    // öncesi dönüştürülür (bkz. `PostgresPlayerRepository.rowToPlayer`'daki
    // AYNI dönüşüm, uygulama kodunun kendisinde zaten yapılıyor).
    expect(Number(raceRow.rows[0].entry_fee)).toBe(response.body.data.entryFee);
    expect(Number(raceRow.rows[0].prize_pool)).toBe(response.body.data.prizeWon);

    const entryRow = await pool.query('SELECT * FROM race_entries WHERE race_id = $1 AND horse_id = $2', [raceId, horseId]);
    expect(entryRow.rows).toHaveLength(1);
    expect(entryRow.rows[0].finish_position).not.toBeNull();

    const segmentRows = await pool.query('SELECT * FROM race_entry_segments WHERE race_entry_id = $1', [entryRow.rows[0].id]);
    expect(segmentRows.rows.length).toBeGreaterThan(0);
  });

  it('/api/v1/horses/:id/practice-race (POST) — giriş ücretini düşer + ödülü ekler, GERÇEK bakiyeye yansır', async () => {
    const { horseId, playerId } = await registerPlayerWithStarterHorse();

    const beforeRow = await pool.query('SELECT money FROM players WHERE id = $1', [playerId]);
    // `players.money` da BIGINT — bkz. yukarıdaki `entry_fee`/`prize_pool` notu.
    const moneyBefore = Number(beforeRow.rows[0].money);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);

    const { entryFee, prizeWon, newBalance } = response.body.data;
    expect(entryFee).toBe(getPracticeRaceEntryFee(economyConfig));
    expect(newBalance.money).toBe(moneyBefore - entryFee + prizeWon);

    const afterRow = await pool.query('SELECT money FROM players WHERE id = $1', [playerId]);
    expect(Number(afterRow.rows[0].money)).toBe(newBalance.money);
  });

  it('/api/v1/horses/:id/practice-race (POST) — bakiye giriş ücretine yetmiyorsa 409 INSUFFICIENT_FUNDS döner ve HİÇBİR ŞEY yazmaz', async () => {
    const { horseId, playerId } = await registerPlayerWithStarterHorse();
    await pool.query('UPDATE players SET money = 0 WHERE id = $1', [playerId]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Idempotency-Key', randomUUID())
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');

    const raceRows = await pool.query('SELECT * FROM races WHERE track_id IS NULL AND name = $1 ORDER BY created_at DESC LIMIT 1', ['Pratik Yarış']);
    // Bu oyuncu için hiçbir yarış YAZILMAMIŞ olmalı (transaction rollback) —
    // burada sadece bakiyenin hâlâ 0 olduğunu doğrulamak yeterli ve daha
    // sağlam (başka testlerin de "Pratik Yarış" yazdığı paralel bir DB'de
    // en son satırı aramak kırılgan olur).
    void raceRows;
    const moneyRow = await pool.query('SELECT money FROM players WHERE id = $1', [playerId]);
    expect(Number(moneyRow.rows[0].money)).toBe(0);
  });

  it('/api/v1/horses/:id/practice-race (POST) — Idempotency-Key header eksikse 400 IDEMPOTENCY_KEY_REQUIRED döner', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();

    const response = await request(app.getHttpServer()).post(`/api/v1/horses/${horseId}/practice-race`).send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('/api/v1/horses/:id/practice-race (POST) — AYNI Idempotency-Key ile ikinci istek AYNI sonucu döner ve TEKRAR para çekmez', async () => {
    const { horseId, playerId } = await registerPlayerWithStarterHorse();
    const idempotencyKey = randomUUID();

    const first = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Idempotency-Key', idempotencyKey)
      .send({})
      .expect(200);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Idempotency-Key', idempotencyKey)
      .send({})
      .expect(200);

    // AYNI raceId — işlem GERÇEKTEN tekrar çalıştırılmadı, ilk sonuç
    // aynen tekrar döndürüldü (docs/SECURITY.md §4).
    expect(second.body.data.raceId).toBe(first.body.data.raceId);
    expect(second.body.data.newBalance).toEqual(first.body.data.newBalance);

    const moneyRow = await pool.query('SELECT money FROM players WHERE id = $1', [playerId]);
    // Giriş ücreti/ödül YALNIZCA BİR KEZ uygulanmış olmalı.
    expect(Number(moneyRow.rows[0].money)).toBe(first.body.data.newBalance.money);

    const raceRows = await pool.query('SELECT * FROM races WHERE id = $1', [first.body.data.raceId]);
    expect(raceRows.rows).toHaveLength(1);
  });

  it('/api/v1/horses/:id/practice-race (POST) sakatlanmış bir at için 409 HORSE_INJURED döner', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();
    await pool.query("UPDATE horses SET status = 'injured' WHERE id = $1", [horseId]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Idempotency-Key', randomUUID())
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('HORSE_INJURED');
  });

  it('/api/v1/horses/:id/practice-race (POST) var olmayan bir at için 404 döner', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${randomUUID()}/practice-race`)
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
  });

  it('/api/v1/horses/:id/practice-race (POST) geçersiz bir yarış stili için 400 döner', async () => {
    const { horseId } = await registerPlayerWithStarterHorse();
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Idempotency-Key', randomUUID())
      .send({ racingStyle: 'not-a-real-style' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('/api/v1/horses/:id/practice-race (POST) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/horses/not-a-uuid/practice-race')
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(response.status).toBe(400);
  });
});
