import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RaceLobbyListItem } from '@at-sevdalisi/shared-types';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import {
  bootstrapTestApp,
  recordSharedFinishedRace,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * KULÜP İÇİ YARIŞ (09.10.2026, migration 0081 — sahibinin kararı).
 * Kanıtlananlar:
 *   (1) Lider/subay "yalnızca kulübüm" yarışı açar; kulüp SUNUCUDA açanın
 *       üyeliğinden bulunur. Sıradan üye ve kulübü olmayan açamaz (403).
 *   (2) Yalnızca o kulübün üyesi katılır; dışarıdan katılım 409
 *       `RACE_CLUB_ONLY` ve PARA/DEFTER DOKUNULMADAN (kapı paradan önce).
 *   (3) Listede kulüp yarışını yalnızca üyeler (ve zaten katılmış olan)
 *       görür; kulüp feshedilse bile katılmış oyuncu yarışını görür, yeni
 *       katılım herkese kapalıdır.
 *   (4) Kulüp dışından birine bu yarış için davet gönderilemez (409).
 */
describe('Kulüp içi yarış (e2e)', () => {
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

  async function createClub(owner: RegisteredTestPlayer): Promise<string> {
    const response = await http()
      .post('/api/v1/clubs')
      .set('Authorization', owner.authHeader)
      .send({ name: `Yarış Kulübü ${randomUUID().slice(0, 8)}` })
      .expect(201);
    return response.body.data.club.id as string;
  }

  const joinClub = (player: RegisteredTestPlayer, clubId: string) =>
    http().post(`/api/v1/clubs/${clubId}/join`).set('Authorization', player.authHeader).expect(200);

  const createRace = (creator: RegisteredTestPlayer, clubOnly: unknown) =>
    http()
      .post('/api/v1/races')
      .set('Authorization', creator.authHeader)
      .send({
        name: `Kulüp Koşusu ${randomUUID().slice(0, 6)}`,
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
        clubOnly,
      });

  const join = (player: RegisteredTestPlayer, raceId: string) =>
    http()
      .post(`/api/v1/races/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId });

  const listIds = async (viewer: RegisteredTestPlayer) =>
    ((await http().get('/api/v1/races?limit=100').set('Authorization', viewer.authHeader).expect(200)).body
      .data as RaceLobbyListItem[]).map((row) => row.id);

  const moneyOf = async (playerId: string) =>
    Number((await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [playerId])).rows[0]!.money);

  it('lider açar, kulüp sunucuda çözülür; üye katılır, dışarıdaki 409 alır ve parası dokunulmaz', async () => {
    const leader = await registerTestPlayerWithStarterHorse(app, 'Kulüp Lideri');
    const member = await registerTestPlayerWithStarterHorse(app, 'Kulüp Üyesi');
    const outsider = await registerTestPlayerWithStarterHorse(app, 'Dışarıdaki');
    const clubId = await createClub(leader);
    await joinClub(member, clubId);

    const created = await createRace(leader, true).expect(201);
    const raceId = created.body.data.id as string;
    expect(created.body.data.clubId).toBe(clubId);

    await join(member, raceId).expect(200);

    const before = await moneyOf(outsider.playerId);
    const rejected = await join(outsider, raceId).expect(409);
    expect(rejected.body.error.code).toBe('RACE_CLUB_ONLY');
    expect(await moneyOf(outsider.playerId)).toBe(before);
    const ledger = await pool.query(
      "SELECT 1 FROM economy_transactions WHERE player_id = $1 AND reference_id = $2",
      [outsider.playerId, raceId],
    );
    expect(ledger.rowCount).toBe(0);

    // Liste: üyeler görür, dışarıdaki görmez.
    expect(await listIds(leader)).toContain(raceId);
    expect(await listIds(member)).toContain(raceId);
    expect(await listIds(outsider)).not.toContain(raceId);
    const row = ((await http().get('/api/v1/races?limit=100').set('Authorization', member.authHeader).expect(200)).body
      .data as RaceLobbyListItem[]).find((item) => item.id === raceId)!;
    expect(row.clubId).toBe(clubId);
  });

  it('sıradan üye ve kulübü olmayan kulüp yarışı açamaz; subay açar; boolean olmayan değer 400', async () => {
    const leader = await registerTestPlayerWithStarterHorse(app, 'Açan Lider');
    const member = await registerTestPlayerWithStarterHorse(app, 'Sıradan Üye');
    const loner = await registerTestPlayerWithStarterHorse(app, 'Kulüpsüz');
    const clubId = await createClub(leader);
    await joinClub(member, clubId);

    expect((await createRace(member, true).expect(403)).body.error.code).toBe('INSUFFICIENT_CLUB_PERMISSION');
    expect((await createRace(loner, true).expect(403)).body.error.code).toBe('NOT_CLUB_MEMBER');
    await createRace(leader, 'true').expect(400);
    // Açık yarışı herkes açabilir (clubOnly false/yok).
    expect((await createRace(loner, false).expect(201)).body.data.clubId).toBeNull();

    await http()
      .post(`/api/v1/clubs/${clubId}/members/${member.playerId}/role`)
      .set('Authorization', leader.authHeader)
      .send({ role: 'officer' })
      .expect(200);
    expect((await createRace(member, true).expect(201)).body.data.clubId).toBe(clubId);
  });

  it('kulüpten çıkan katılımcı yarışını görmeye devam eder; feshedilen kulübün yarışına yeni katılım kapalı', async () => {
    const leader = await registerTestPlayerWithStarterHorse(app, 'Fesih Lideri');
    const member = await registerTestPlayerWithStarterHorse(app, 'Ayrılan Üye');
    const clubId = await createClub(leader);
    await joinClub(member, clubId);
    const raceId = (await createRace(leader, true).expect(201)).body.data.id as string;
    await join(member, raceId).expect(200);

    await http().post('/api/v1/clubs/leave').set('Authorization', member.authHeader).expect(200);
    expect(await listIds(member)).toContain(raceId);

    await http().delete(`/api/v1/clubs/${clubId}`).set('Authorization', leader.authHeader).expect(200);
    // Kulüp yok → üyesi yok → kapı kimseye açılmaz (yarış sessizce herkese açılmaz).
    const latecomer = await registerTestPlayerWithStarterHorse(app, 'Geç Gelen');
    expect((await join(latecomer, raceId).expect(409)).body.error.code).toBe('RACE_CLUB_ONLY');
    expect(await listIds(latecomer)).not.toContain(raceId);
    // Açan lider de listede görmeye devam eder (açtığı yarış).
    expect(await listIds(leader)).toContain(raceId);
  });

  it('kulüp dışından birine kulüp yarışı daveti gönderilemez; üyeye gönderilir', async () => {
    const leader = await registerTestPlayerWithStarterHorse(app, 'Davet Eden Lider');
    const member = await registerTestPlayerWithStarterHorse(app, 'Davetli Üye');
    const friend = await registerTestPlayerWithStarterHorse(app, 'Dış Arkadaş');
    const clubId = await createClub(leader);
    await joinClub(member, clubId);
    // Arkadaşlık birlikte yarışmış olmayı ister (08.10.2026) — SQL fikstürü.
    for (const other of [member, friend]) {
      await recordSharedFinishedRace(app, [leader, other]);
      const sent = await http()
        .post(`/api/v1/players/${leader.playerId}/friend-requests`)
        .set('Authorization', leader.authHeader)
        .send({ addresseeId: other.playerId })
        .expect(201);
      await http()
        .post(`/api/v1/players/${other.playerId}/friend-requests/${sent.body.data.requestId}/respond`)
        .set('Authorization', other.authHeader)
        .send({ action: 'accept' })
        .expect(200);
    }
    const raceId = (await createRace(leader, true).expect(201)).body.data.id as string;

    const invite = (invitee: RegisteredTestPlayer) =>
      http()
        .post(`/api/v1/players/${leader.playerId}/race-invites`)
        .set('Authorization', leader.authHeader)
        .send({ inviteeId: invitee.playerId, raceId });
    expect((await invite(friend).expect(409)).body.error.code).toBe('RACE_CLUB_ONLY');
    await invite(member).expect(201);
  });
});
