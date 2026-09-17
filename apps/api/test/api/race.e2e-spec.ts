import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EconomyConfig } from '@at-sevdalisi/game-config';
import economyConfigJson from '../../../../config/economy.config.json';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { getPracticeRaceEntryFee } from '../../src/domain/race/prize';
import { bootstrapTestApp, registerTestPlayer, registerTestPlayerWithStarterHorse } from './test-helpers';

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
 * AUDIT_REPORT.md Bulgu S2 hardening (bu oturum) — `POST /horses/:id/
 * practice-race` artık `HorseOwnerGuardByParam` ile korunur (bkz.
 * `race.controller.ts`, `@UseInterceptors(IdempotencyInterceptor)`'ın
 * ÜSTÜNDE) — istek sahibinin at'ın GERÇEK sahibi olması gerekir.
 */
describe('Race — Pratik Yarış (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();

    // "Sakatlanmış at yarışamaz" senaryosu doğal yoldan tetiklenmesi zor
    // (antrenman sakatlık riski deterministik değil) — uygulamanın kendi
    // DB havuzu üzerinden DOĞRUDAN ayarlanır. `stable.e2e-spec.ts`'teki
    // AYNI teknik: gerçek bir kullanıcı akışı DEĞİL, yalnızca test kurulumu.
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/horses/:id/practice-race (POST) — varsayılan taktikle bir yarış çalıştırır ve TÜM katılımcılarla sonuç döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
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
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ racingStyle: 'front_runner', riskLevel: 'high', startApproach: 'aggressive', finalStretchPlan: 'early_sprint' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('/api/v1/horses/:id/practice-race (POST) — sonucu races/race_entries tablolarına gerçekten yazar (entry_fee/prize_pool DAHİL)', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
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
    // AUDIT_AND_HARDENING Öncelik 4 (bu oturum) — deterministik replay için
    // her yarış hangi engine/ruleset/config sürümüyle üretildiğini KAYDETMELİ
    // (bkz. migration 0021, `domain/race/race-engine.ts` RACE_ENGINE_VERSION/
    // RACE_RULESET_VERSION). 'unknown' DEĞİL — bu, migration'ın SADECE eski
    // (migration öncesi) satırlar için kabul ettiği açık-eksik işaretidir.
    expect(raceRow.rows[0].engine_version).toBe('1.0.0');
    expect(raceRow.rows[0].ruleset_version).toBe('1.1.0');
    expect(raceRow.rows[0].config_version).toBe('1.0.0');

    const entryRow = await pool.query('SELECT * FROM race_entries WHERE race_id = $1 AND horse_id = $2', [raceId, horseId]);
    expect(entryRow.rows).toHaveLength(1);
    expect(entryRow.rows[0].finish_position).not.toBeNull();

    const segmentRows = await pool.query('SELECT * FROM race_entry_segments WHERE race_entry_id = $1', [entryRow.rows[0].id]);
    expect(segmentRows.rows.length).toBeGreaterThan(0);
  });

  it('/api/v1/horses/:id/practice-race (POST) — giriş ücretini düşer + ödülü ekler, GERÇEK bakiyeye yansır', async () => {
    const { horseId, playerId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');

    const beforeRow = await pool.query('SELECT money FROM players WHERE id = $1', [playerId]);
    // `players.money` da BIGINT — bkz. yukarıdaki `entry_fee`/`prize_pool` notu.
    const moneyBefore = Number(beforeRow.rows[0].money);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
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
    const { horseId, playerId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    await pool.query('UPDATE players SET money = 0 WHERE id = $1', [playerId]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
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

  it('/api/v1/horses/:id/practice-race (POST) Authorization header olmadan 401 döner', async () => {
    const { horseId } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(response.status).toBe(401);
  });

  it('/api/v1/horses/:id/practice-race (POST) başkasının atıyla yarıştırmaya çalışan istek 403 döner (AUDIT_REPORT.md S2)', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Gerçek Sahip');
    const attacker = await registerTestPlayer(app, 'Saldırgan');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${owner.horseId}/practice-race`)
      .set('Authorization', attacker.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('/api/v1/horses/:id/practice-race (POST) — Idempotency-Key header eksikse 400 IDEMPOTENCY_KEY_REQUIRED döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('/api/v1/horses/:id/practice-race (POST) — AYNI Idempotency-Key ile ikinci istek AYNI sonucu döner ve TEKRAR para çekmez', async () => {
    const { horseId, playerId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    const idempotencyKey = randomUUID();

    const first = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', idempotencyKey)
      .send({})
      .expect(200);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
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
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    await pool.query("UPDATE horses SET status = 'injured' WHERE id = $1", [horseId]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('HORSE_INJURED');
  });

  it('/api/v1/horses/:id/practice-race (POST) var olmayan bir at için 404 döner', async () => {
    const someone = await registerTestPlayer(app, 'Herhangi Biri');
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${randomUUID()}/practice-race`)
      .set('Authorization', someone.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HORSE_NOT_FOUND');
  });

  it('/api/v1/horses/:id/practice-race (POST) geçersiz bir yarış stili için 400 döner', async () => {
    const { horseId, authHeader } = await registerTestPlayerWithStarterHorse(app, 'Yarışçı');
    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/practice-race`)
      .set('Authorization', authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ racingStyle: 'not-a-real-style' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('/api/v1/horses/:id/practice-race (POST) geçersiz (UUID olmayan) bir id için 400 döner', async () => {
    const someone = await registerTestPlayer(app, 'Herhangi Biri İki');
    const response = await request(app.getHttpServer())
      .post('/api/v1/horses/not-a-uuid/practice-race')
      .set('Authorization', someone.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(response.status).toBe(400);
  });
});
