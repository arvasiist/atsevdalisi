import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCareerConfig } from '@at-sevdalisi/game-config';
import { careerPointsForPlace } from '../../src/domain/career/career';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * KARİYER (16.10.2026, brief §10). Kanıtlananlar:
 *  1. Puan GERÇEK yarış sonucundan türetilir (pratik yarış → derecenin puanı;
 *     geçmişte satır, sınıf ve puan).
 *  2. Kademe kapısı: kademesi yetmeyen oyuncu üst masaya / yurt dışı pistine
 *     katılamaz (409 CAREER_TIER_LOCKED, para + defter DEĞİŞMEZ), açamaz;
 *     lobi satırı gereken kademeyi gösterir. Puan eşiği geçilince kapı açılır.
 *  3. Kademe ödülü başarım yolundan alınır (tek sefer, defter satırıyla).
 *
 * Eşiği geçmek için gerçek yarış koşturan oyuncular (2. ve 3. maddede) puanı
 * DOĞRUDAN yarış sonucu fikstürüyle alır — burada kapının kendisi sınanır,
 * fikstür bitmiş yarış satırıdır (puanın kaynağıyla aynı tablo).
 */
describe('Kariyer (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const career = loadCareerConfig();
  const regional = career.tiers.find((tier) => tier.key === 'regional')!;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const careerOf = async (player: RegisteredTestPlayer) =>
    (await http().get('/api/v1/career').set('Authorization', player.authHeader).expect(200)).body.data;

  /** Oyuncuya `finishPosition` ile bitmiş, `tableId` masalı bir lobi yarışı sonucu yazar. */
  async function recordFinish(player: RegisteredTestPlayer, tableId: string | null, finishPosition: number, times = 1) {
    await pool.query(
      `WITH new_races AS (
         INSERT INTO races (name, distance_m, surface, weather, start_time, max_players, race_type, entry_fee,
                            participant_limit, status, engine_version, ruleset_version, config_version,
                            weather_config_version, table_id)
         SELECT 'Kariyer Koşusu', 1200, 'grass', 'sunny', now() - interval '3 hours', 8, 'free', 0, 12, 'finished',
                'test-engine', 'test-ruleset', 'test-config', 'test-weather-config', $2
           FROM generate_series(1, $4::int)
         RETURNING id)
       INSERT INTO race_entries (race_id, horse_id, player_id, gate_position, finish_position, status)
       SELECT id, $3, $1, 1, $5, 'ready' FROM new_races`,
      [player.playerId, tableId, player.horseId, times, finishPosition],
    );
  }

  const moneyOf = async (playerId: string) =>
    Number((await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [playerId])).rows[0]!.money);
  const ledgerCount = async (playerId: string) =>
    Number(
      (await pool.query<{ n: string }>('SELECT count(*) AS n FROM economy_transactions WHERE player_id = $1', [playerId]))
        .rows[0]!.n,
    );

  function raceBody(extra: Record<string, unknown>): Record<string, unknown> {
    return {
      name: 'Kariyer Kapısı',
      fieldSize: 10,
      maxPlayers: 8,
      entryFee: 250,
      raceType: 'paid',
      // Erken başlangıç: liste sınırlı ve başlangıca göre sıralı (birikmiş veride de görünsün).
      startTime: new Date(Date.now() + 130 * 1_000).toISOString(),
      surface: 'grass',
      weather: 'sunny',
      distanceMeters: 1_600,
      tribuneFee: 0,
      spectatorCapacity: 500,
      ...extra,
    };
  }

  it('yeni oyuncu ilk kademede; gerçek pratik yarış derecesinin puanını kazandırır ve geçmişe yazılır', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Kariyer Çaylağı');
    const fresh = await careerOf(player);
    expect(fresh).toMatchObject({ points: 0, tier: { key: career.tiers[0]!.key, index: 0 }, history: [] });
    expect(fresh.next).toMatchObject({ key: regional.key, pointsToNext: regional.requiredPoints });
    expect(fresh.tiers.map((tier: { reached: boolean }) => tier.reached)).toEqual(career.tiers.map((_, i) => i === 0));

    const run = await http()
      .post(`/api/v1/horses/${player.horseId}/practice-race`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    const raceId = run.body.data.raceId as string;
    const position = Number(
      (
        await pool.query<{ finish_position: number }>(
          'SELECT finish_position FROM race_entries WHERE race_id = $1 AND player_id = $2',
          [raceId, player.playerId],
        )
      ).rows[0]!.finish_position,
    );
    const expected = careerPointsForPlace('practice', position, career);
    const after = await careerOf(player);
    expect(after.points).toBe(expected);
    expect(after.history[0]).toMatchObject({ raceId, classKey: 'practice', finishPosition: position, points: expected });
  });

  it('kademe kapısı: üst masaya katılım 409 ve para/defter değişmez; liste gereken kademeyi gösterir; eşikten sonra açılır', async () => {
    const host = await registerTestPlayerWithStarterHorse(app, 'Bölgesel Ev Sahibi');
    await recordFinish(host, 'regional', 1, Math.ceil(regional.requiredPoints / career.racePoints.regional![0]));
    const created = await http()
      .post('/api/v1/races')
      .set('Authorization', host.authHeader)
      .send(raceBody({ tableId: 'regional' }))
      .expect(201);
    const raceId = created.body.data.id as string;

    const rookie = await registerTestPlayerWithStarterHorse(app, 'Bölgesel Çaylak');
    const moneyBefore = await moneyOf(rookie.playerId);
    const ledgerBefore = await ledgerCount(rookie.playerId);
    const locked = await http()
      .post(`/api/v1/races/${raceId}/join`)
      .set('Authorization', rookie.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: rookie.horseId });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('CAREER_TIER_LOCKED');
    expect(await moneyOf(rookie.playerId)).toBe(moneyBefore);
    expect(await ledgerCount(rookie.playerId)).toBe(ledgerBefore);

    // Açmak da kapalı.
    const createLocked = await http()
      .post('/api/v1/races')
      .set('Authorization', rookie.authHeader)
      .send(raceBody({ tableId: 'regional' }));
    expect(createLocked.status).toBe(409);
    expect(createLocked.body.error.code).toBe('CAREER_TIER_LOCKED');

    const listRow = async (player: RegisteredTestPlayer) =>
      (
        await http().get('/api/v1/races').query({ limit: '100' }).set('Authorization', player.authHeader).expect(200)
      ).body.data.find((race: { id: string }) => race.id === raceId);
    expect((await listRow(rookie)).careerRequirement).toMatchObject({
      key: regional.key,
      pointsToRequired: regional.requiredPoints,
    });
    expect((await listRow(host)).careerRequirement).toBeNull();

    // Eşik bir puan eksikken kapalı, tam eşikte açık (yerel masa birincilikleri).
    const localFirst = career.racePoints.local![0];
    await recordFinish(rookie, 'local', 1, Math.floor((regional.requiredPoints - 1) / localFirst));
    const short = (await careerOf(rookie)).points;
    expect(short).toBeLessThan(regional.requiredPoints);
    await recordFinish(rookie, null, 4, regional.requiredPoints - short); // masasız lobi, 4.+ = open[3]
    expect((await careerOf(rookie)).points).toBeGreaterThanOrEqual(regional.requiredPoints);
    await http()
      .post(`/api/v1/races/${raceId}/join`)
      .set('Authorization', rookie.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: rookie.horseId })
      .expect(200);
  });

  it('yurt dışı pisti uluslararası kademe ister (masasız yarışta da)', async () => {
    const international = career.tiers.find((tier) => tier.key === 'international')!;
    const host = await registerTestPlayerWithStarterHorse(app, 'Paris Ev Sahibi');
    await recordFinish(host, 'championship', 1, Math.ceil(international.requiredPoints / career.racePoints.championship![0]));
    const created = await http()
      .post('/api/v1/races')
      .set('Authorization', host.authHeader)
      .send(raceBody({ name: 'Paris Koşusu', hippodrome: 'paris', fieldSize: 8, entryFee: 0, raceType: 'free', distanceMeters: 2_000 }))
      .expect(201);
    const rookie = await registerTestPlayerWithStarterHorse(app, 'Paris Çaylağı');
    const locked = await http()
      .post(`/api/v1/races/${created.body.data.id as string}/join`)
      .set('Authorization', rookie.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: rookie.horseId });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('CAREER_TIER_LOCKED');
    expect(locked.body.error.message).toContain(international.name);
  });

  it('kademe ödülü başarım olarak bir kez alınır (defter satırıyla)', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Ödüllü Kariyer');
    const claim = () =>
      http().post('/api/v1/achievements/career-regional/claim').set('Authorization', player.authHeader);
    expect((await claim()).status).toBe(409);
    await recordFinish(player, 'regional', 1, Math.ceil(regional.requiredPoints / career.racePoints.regional![0]));
    const before = await moneyOf(player.playerId);
    const paid = await claim().expect(200);
    expect(await moneyOf(player.playerId)).toBe(before + paid.body.data.rewardMoney);
    const ledger = await pool.query(
      "SELECT 1 FROM economy_transactions WHERE player_id = $1 AND type = 'achievement_reward'",
      [player.playerId],
    );
    expect(ledger.rows).toHaveLength(1);
    expect((await claim()).status).toBe(409);
  });
});
