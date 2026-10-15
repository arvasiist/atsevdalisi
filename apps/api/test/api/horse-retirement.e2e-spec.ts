import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadHorseGrowthConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { STARTER_HORSE_AGE_MONTHS } from '../../src/domain/horse/horse';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * 15.10.2026 — S5 (`docs/OYUN_DONGUSU_DENETIMI.md` B7/B11): emeklilik ucu ve
 * oyun yaşı. Sahibinin kararları: damızlık için emeklilik şart; 1 gerçek gün =
 * 1 oyun ayı. Damızlık kuralları `breeding.e2e-spec.ts`te.
 */
const GROWTH = loadHorseGrowthConfig();

describe('Emeklilik + oyun yaşı (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Test kısayolu: oyuncuya ikinci (yarışabilir) bir at yazar. */
  async function insertSecondHorse(ownerId: string, name: string): Promise<string> {
    const horseId = randomUUID();
    await pool.query(
      `INSERT INTO horses (id, owner_id, name, gender, breed, birth_date, quality, potential)
       VALUES ($1, $2, $3, 'mare', 'hinis', (now() - interval '60 months')::date, 50, 60)`,
      [horseId, ownerId, name],
    );
    await pool.query('INSERT INTO horse_stats (horse_id) VALUES ($1)', [horseId]);
    return horseId;
  }

  function retire(player: RegisteredTestPlayer, horseId: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/horses/${horseId}/retire`)
      .set('Authorization', player.authHeader)
      .send({});
  }

  async function ownList(player: RegisteredTestPlayer): Promise<Array<Record<string, unknown>>> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/horses?ownerId=${player.playerId}`)
      .set('Authorization', player.authHeader)
      .expect(200);
    return response.body.data as Array<Record<string, unknown>>;
  }

  it('at emekli edilir: durum + emeklilik anı yazılır, liste gösterir; ikinci istek 409 (geri alınmaz)', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Emekli Eden');
    await insertSecondHorse(player.playerId, 'Yedek At');

    const response = await retire(player, player.horseId).expect(200);
    expect(response.body.data.status).toBe('retired');
    expect(typeof response.body.data.retiredAt).toBe('string');
    expect(response.body.data).not.toHaveProperty('agingStartedAt');

    const row = (await ownList(player)).find((horse) => horse.id === player.horseId)!;
    expect(row.status).toBe('retired');

    const again = await retire(player, player.horseId).expect(409);
    expect(again.body.error.code).toBe('HORSE_ALREADY_RETIRED');
  });

  it('emekli at yarışamaz ve antrenman yapamaz; veritabanı emekli atı başka duruma DÖNDÜRMEZ', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Emekli Koşturan');
    await insertSecondHorse(player.playerId, 'Koşan Yedek');
    await retire(player, player.horseId).expect(200);

    const race = await request(app.getHttpServer())
      .post(`/api/v1/horses/${player.horseId}/practice-race`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(race.status).toBe(409);
    expect(race.body.error.code).toBe('HORSE_NOT_ACTIVE');

    const train = await request(app.getHttpServer())
      .post(`/api/v1/horses/${player.horseId}/train`)
      .set('Authorization', player.authHeader)
      .send({ type: 'speed', intensity: 'low', durationMinutes: 30 });
    expect(train.status).toBe(409);
    expect(train.body.error.code).toBe('HORSE_RETIRED');

    await expect(pool.query("UPDATE horses SET status = 'active' WHERE id = $1", [player.horseId])).rejects.toThrow(
      /horses_retired_at_requires_status/,
    );
  });

  it('oyuncu yarışabilecek SON atını emekli edemez (409 LAST_RACING_HORSE)', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Tek Atlı');
    const response = await retire(player, player.horseId).expect(409);
    expect(response.body.error.code).toBe('LAST_RACING_HORSE');
    const row = await pool.query('SELECT status, retired_at FROM horses WHERE id = $1', [player.horseId]);
    expect(row.rows[0]).toMatchObject({ status: 'active', retired_at: null });
  });

  it('EŞZAMANLI iki emeklilik son atı bırakmaz: biri geçer, diğeri 409', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Aceleci');
    const second = await insertSecondHorse(player.playerId, 'Aceleci İkinci');

    const results = await Promise.all([retire(player, player.horseId), retire(player, second)]);
    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)?.body.error.code).toBe('LAST_RACING_HORSE');
    const active = await pool.query("SELECT COUNT(*) FROM horses WHERE owner_id = $1 AND status <> 'retired'", [
      player.playerId,
    ]);
    expect(Number(active.rows[0].count)).toBe(1);
  });

  it('başkasının atı 403; ilandaki at ve açık yarışa kayıtlı at 409', async () => {
    const owner = await registerTestPlayerWithStarterHorse(app, 'Asıl Sahip');
    const stranger = await registerTestPlayerWithStarterHorse(app, 'Yabancı');
    await insertSecondHorse(owner.playerId, 'Sahip Yedeği');
    expect((await retire(stranger, owner.horseId)).status).toBe(403);

    const listed = await insertSecondHorse(owner.playerId, 'İlandaki At');
    await pool.query(
      `INSERT INTO market_listings (seller_id, horse_id, price, listing_type, status)
       VALUES ($1, $2, 1000, 'fixed_price', 'active')`,
      [owner.playerId, listed],
    );
    const listedResponse = await retire(owner, listed).expect(409);
    expect(listedResponse.body.error.code).toBe('HORSE_LISTED_IN_MARKET');

    const created = await request(app.getHttpServer())
      .post('/api/v1/races')
      .set('Authorization', stranger.authHeader)
      .send({
        name: 'Emeklilik Kupası',
        fieldSize: 8,
        maxPlayers: 8,
        entryFee: 100,
        raceType: 'paid',
        startTime: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        surface: 'grass',
        weather: 'sunny',
        distanceMeters: 1_600,
        tribuneFee: 0,
        spectatorCapacity: 500,
      })
      .expect(201);
    await pool.query('UPDATE players SET money = 10000 WHERE id = $1', [owner.playerId]);
    await request(app.getHttpServer())
      .post(`/api/v1/races/${created.body.data.id}/join`)
      .set('Authorization', owner.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: owner.horseId })
      .expect(200);
    const racing = await retire(owner, owner.horseId).expect(409);
    expect(racing.body.error.code).toBe('HORSE_IN_ACTIVE_RACE');
  });

  it('OYUN YAŞI: başlangıç atı 48 ayla başlar, her gerçek günde `gameMonthsPerRealDay` ay yaşlanır', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Yaş Sayan');
    const fresh = (await ownList(player)).find((horse) => horse.id === player.horseId)!;
    expect(fresh.ageMonths).toBe(STARTER_HORSE_AGE_MONTHS);

    // Zamanın geçişini taklit: doğum ve çıpa BİRLİKTE geri alınır (yalnızca çıpayı
    // almak, çıpa anındaki takvim yaşını da küçültürdü — formül doğru davranır).
    await pool.query(
      `UPDATE horses SET aging_started_at = aging_started_at - interval '3 days',
                         birth_date = birth_date - 3
       WHERE id = $1`,
      [player.horseId],
    );
    const older = (await ownList(player)).find((horse) => horse.id === player.horseId)!;
    expect(older.ageMonths).toBe(STARTER_HORSE_AGE_MONTHS + 3 * GROWTH.gameMonthsPerRealDay);
  });

  it('kimlik doğrulanmadan 401', async () => {
    await request(app.getHttpServer()).post(`/api/v1/horses/${randomUUID()}/retire`).send({}).expect(401);
  });
});
