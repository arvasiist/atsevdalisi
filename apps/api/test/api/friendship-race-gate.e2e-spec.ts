import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

type Racer = RegisteredTestPlayer & { horseId: string };

/**
 * ARKADAŞLIK YALNIZCA BİRLİKTE YARIŞANLAR ARASINDA (08.10.2026, sahibinin
 * kuralı). Kural GERÇEK uçlarla sınanır: yarış açılır, iki oyuncu katılıp
 * hazır der, yarış kesinleşir — fikstür değil (diğer sosyal testler bu ön
 * koşulu `recordSharedFinishedRace` ile kurar; burası kuralın kendisidir).
 */
describe('Arkadaşlık yarış kapısı (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const requestsUrl = (playerId: string) => `/api/v1/players/${playerId}/friend-requests`;
  const companionsUrl = (playerId: string) => `/api/v1/players/${playerId}/race-companions`;

  async function openRace(creator: Racer): Promise<string> {
    const created = await http()
      .post('/api/v1/races')
      .set('Authorization', creator.authHeader)
      .send({
        name: 'Tanışma Koşusu',
        fieldSize: 8,
        maxPlayers: 8,
        entryFee: 100,
        raceType: 'paid',
        startTime: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        surface: 'dirt',
        weather: 'sunny',
        distanceMeters: 1_400,
        tribuneFee: 0,
        spectatorCapacity: 500,
      })
      .expect(201);
    return created.body.data.id as string;
  }

  async function joinAndReady(player: Racer, raceId: string): Promise<void> {
    await http()
      .post(`/api/v1/races/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId })
      .expect(200);
    await http()
      .post(`/api/v1/races/${raceId}/ready`)
      .set('Authorization', player.authHeader)
      .send({ status: 'ready' })
      .expect(200);
  }

  async function settle(raceId: string, crank: RegisteredTestPlayer): Promise<void> {
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);
    await http().post(`/api/v1/races/${raceId}/settle`).set('Authorization', crank.authHeader).expect(200);
  }

  async function companions(player: RegisteredTestPlayer): Promise<Array<Record<string, unknown>>> {
    const response = await http().get(companionsUrl(player.playerId)).set('Authorization', player.authHeader).expect(200);
    return response.body.data as Array<Record<string, unknown>>;
  }

  const friendshipRows = async (a: RegisteredTestPlayer, b: RegisteredTestPlayer) =>
    Number(
      (
        await pool.query(
          `SELECT count(*) FROM friendships
            WHERE (player_low_id = $1 AND player_high_id = $2) OR (player_low_id = $2 AND player_high_id = $1)`,
          [a.playerId, b.playerId],
        )
      ).rows[0].count,
    );

  it('birlikte yarışmamış oyuncuya istek 409 FRIENDSHIP_REQUIRES_SHARED_RACE — satır yazılmaz', async () => {
    const a = await registerTestPlayerWithStarterHorse(app, 'Yabancı A');
    const b = await registerTestPlayerWithStarterHorse(app, 'Yabancı B');
    const response = await http()
      .post(requestsUrl(a.playerId))
      .set('Authorization', a.authHeader)
      .send({ addresseeId: b.playerId })
      .expect(409);
    expect(response.body.error.code).toBe('FRIENDSHIP_REQUIRES_SHARED_RACE');
    expect(await friendshipRows(a, b)).toBe(0);
    expect(await companions(a)).toEqual([]);
  });

  it('aynı yarışa KAYITLI ama yarış bitmemişse kapı kapalıdır', async () => {
    const a = await registerTestPlayerWithStarterHorse(app, 'Bekleyen A');
    const b = await registerTestPlayerWithStarterHorse(app, 'Bekleyen B');
    const raceId = await openRace(a);
    await joinAndReady(a, raceId);
    await joinAndReady(b, raceId);
    const response = await http()
      .post(requestsUrl(a.playerId))
      .set('Authorization', a.authHeader)
      .send({ addresseeId: b.playerId })
      .expect(409);
    expect(response.body.error.code).toBe('FRIENDSHIP_REQUIRES_SHARED_RACE');
  });

  it('bitmiş yarıştan sonra: listede görünür, istek + kabul geçer, ilişki durumu izlenir', async () => {
    const a = await registerTestPlayerWithStarterHorse(app, 'Rakip A');
    const b = await registerTestPlayerWithStarterHorse(app, 'Rakip B');
    const crank = await registerTestPlayerWithStarterHorse(app, 'Tanışma Krank');
    const raceId = await openRace(a);
    await joinAndReady(a, raceId);
    await joinAndReady(b, raceId);
    await settle(raceId, crank);

    const before = await companions(a);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ playerId: b.playerId, sharedRaces: 1, relation: 'none' });
    expect(typeof before[0]!.username).toBe('string');
    expect(typeof before[0]!.lastRacedAt).toBe('string');
    // Bakiye SIZMAZ (yalnızca `SocialPlayerView` alanları + sayım).
    expect(before[0]).not.toHaveProperty('money');
    expect(before[0]).not.toHaveProperty('gems');
    // Yarışı yalnızca kesinleştiren (koşmayan) oyuncu listede DEĞİLDİR.
    expect(await companions(crank)).toEqual([]);

    const created = await http()
      .post(requestsUrl(a.playerId))
      .set('Authorization', a.authHeader)
      .send({ addresseeId: b.playerId })
      .expect(201);
    expect((await companions(a))[0]!.relation).toBe('outgoing');
    expect((await companions(b))[0]!.relation).toBe('incoming');

    await http()
      .post(`${requestsUrl(b.playerId)}/${created.body.data.requestId as string}/respond`)
      .set('Authorization', b.authHeader)
      .send({ action: 'accept' })
      .expect(200);
    expect((await companions(a))[0]!.relation).toBe('friend');
    expect((await companions(b))[0]!.relation).toBe('friend');
  });

  it('kural öncesinden kalan bekleyen istek KABUL edilemez (409); reddedilebilir', async () => {
    const a = await registerTestPlayerWithStarterHorse(app, 'Eski İstek A');
    const b = await registerTestPlayerWithStarterHorse(app, 'Eski İstek B');
    const [low, high] = [a.playerId, b.playerId].sort();
    const legacy = await pool.query<{ id: string }>(
      `INSERT INTO friendships (player_low_id, player_high_id, requested_by_id, status)
       VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [low, high, a.playerId],
    );
    const requestId = legacy.rows[0]!.id;

    const accept = await http()
      .post(`${requestsUrl(b.playerId)}/${requestId}/respond`)
      .set('Authorization', b.authHeader)
      .send({ action: 'accept' })
      .expect(409);
    expect(accept.body.error.code).toBe('FRIENDSHIP_REQUIRES_SHARED_RACE');
    const still = await pool.query('SELECT status FROM friendships WHERE id = $1', [requestId]);
    expect(still.rows[0].status).toBe('pending');

    await http()
      .post(`${requestsUrl(b.playerId)}/${requestId}/respond`)
      .set('Authorization', b.authHeader)
      .send({ action: 'reject' })
      .expect(200);
  });

  it('engellenen rakip listede görünmez; başkasının listesi 403', async () => {
    const a = await registerTestPlayerWithStarterHorse(app, 'Engelci A');
    const b = await registerTestPlayerWithStarterHorse(app, 'Engelli B');
    const crank = await registerTestPlayerWithStarterHorse(app, 'Engel Krank');
    const raceId = await openRace(a);
    await joinAndReady(a, raceId);
    await joinAndReady(b, raceId);
    await settle(raceId, crank);
    expect(await companions(a)).toHaveLength(1);

    await http()
      .post(`/api/v1/players/${b.playerId}/blocks`)
      .set('Authorization', b.authHeader)
      .send({ blockedId: a.playerId })
      .expect(201);
    expect(await companions(a)).toEqual([]);
    expect(await companions(b)).toEqual([]);

    await http().get(companionsUrl(a.playerId)).set('Authorization', crank.authHeader).expect(403);
  });
});
