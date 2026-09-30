import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LockRaceUseCase } from '../../src/application/use-cases/lock-race.use-case';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * READY ŞARTI (30.09.2026) — proje sahibinin talebi: "HAZIR OLAN kişiler
 * yarışabilsinler". Bu dilimden önce `race_entries.status` yalnızca bilgiydi:
 * kilit ve kesinleşme `cancelled` dışındaki HER katılımı koşturuyordu.
 *
 * **BU DOSYANIN KANITLADIĞI ŞEYLER:**
 *  1. Kilit anında `ready` demeyen (`waiting`/`not_ready`) katılım İPTAL
 *     edilir, ödediği ücret TAM OLARAK iade edilir (defterde bir
 *     `race_entry_refund`), havuz aynı miktarda küçülür ve snapshot ALMAZ.
 *  2. `scheduled` yarış doğrudan kesinleştirilirse aynı kural uygulanır:
 *     sonuçta yalnızca hazır oyuncu görünür.
 *  3. Hiç hazır oyuncu yoksa yarışın KENDİSİ iptal olur ve herkes iade alır.
 *  4. İade İKİ KEZ yapılmaz: ikinci tur/çağrı yeni bir defter satırı yazmaz.
 */
describe('READY şartı (e2e) — hazır olmayan koşmaz, ücreti iade edilir', () => {
  let app: INestApplication;
  let pool: Pool;
  let lockRaceUseCase: LockRaceUseCase;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    lockRaceUseCase = app.get(LockRaceUseCase);
  });

  afterAll(async () => {
    await app.close();
  });

  const racesUrl = '/api/v1/races';
  const ENTRY_FEE = 100;

  async function createRace(creator: RegisteredTestPlayer): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(racesUrl)
      .set('Authorization', creator.authHeader)
      .send({
        name: 'Hazırlık Kupası',
        fieldSize: 8,
        maxPlayers: 8,
        entryFee: ENTRY_FEE,
        raceType: 'paid',
        startTime: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        surface: 'grass',
        weather: 'sunny',
        distanceMeters: 1_600,
        tribuneFee: 0,
        spectatorCapacity: 500,
      })
      .expect(201);
    return response.body.data.id as string;
  }

  async function join(player: RegisteredTestPlayer, raceId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: player.horseId })
      .expect(200);
  }

  async function setReady(player: RegisteredTestPlayer, raceId: string, status: 'ready' | 'not_ready'): Promise<void> {
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/ready`)
      .set('Authorization', player.authHeader)
      .send({ status })
      .expect(200);
  }

  async function makeRaceStarted(raceId: string): Promise<void> {
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);
  }

  async function raceRowOf(raceId: string): Promise<{ status: string; prize_pool: string }> {
    const result = await pool.query<{ status: string; prize_pool: string }>(
      'SELECT status, prize_pool FROM races WHERE id = $1',
      [raceId],
    );
    return result.rows[0];
  }

  async function entryOf(raceId: string, playerId: string): Promise<{ status: string; horse_snapshot: unknown }> {
    const result = await pool.query<{ status: string; horse_snapshot: unknown }>(
      'SELECT status, horse_snapshot FROM race_entries WHERE race_id = $1 AND player_id = $2',
      [raceId, playerId],
    );
    return result.rows[0];
  }

  async function moneyOf(playerId: string): Promise<number> {
    const result = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [playerId]);
    return Number(result.rows[0].money);
  }

  async function refundsOf(raceId: string, playerId: string): Promise<number[]> {
    const result = await pool.query<{ amount: string }>(
      `SELECT amount FROM economy_transactions
       WHERE reference_id = $1 AND player_id = $2 AND type = 'race_entry_refund'`,
      [raceId, playerId],
    );
    return result.rows.map((row) => Number(row.amount));
  }

  /** Zamanlayıcının turu — `race-lifecycle.e2e-spec.ts` ile AYNI desen (başka dosyaların yarışları da sırada olabilir). */
  async function lockUntilLeftScheduled(raceId: string): Promise<void> {
    const MAX_TICKS = 25;
    for (let tick = 0; tick < MAX_TICKS; tick += 1) {
      await lockRaceUseCase.execute(new Date());
      if ((await raceRowOf(raceId)).status !== 'scheduled') {
        return;
      }
    }
    throw new Error(`Yarış ${MAX_TICKS} turda scheduled durumundan çıkmadı: ${raceId}`);
  }

  it('KİLİTTE hazır olmayan düşer: iptal + tam iade + havuz küçülür; hazır olan snapshot alır', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Hazırlık Kuran');
    const readyPlayer = await registerTestPlayerWithStarterHorse(app, 'Hazır Olan');
    const waitingPlayer = await registerTestPlayerWithStarterHorse(app, 'Bekleyen');
    const notReadyPlayer = await registerTestPlayerWithStarterHorse(app, 'Hazır Değilim');
    const raceId = await createRace(creator);

    await join(readyPlayer, raceId);
    await join(waitingPlayer, raceId);
    await join(notReadyPlayer, raceId);
    await setReady(readyPlayer, raceId, 'ready');
    await setReady(notReadyPlayer, raceId, 'not_ready');
    const waitingMoneyBefore = await moneyOf(waitingPlayer.playerId);
    const notReadyMoneyBefore = await moneyOf(notReadyPlayer.playerId);
    expect(Number((await raceRowOf(raceId)).prize_pool)).toBe(3 * ENTRY_FEE);

    await makeRaceStarted(raceId);
    await lockUntilLeftScheduled(raceId);

    expect((await raceRowOf(raceId)).status).toBe('locking');
    expect(Number((await raceRowOf(raceId)).prize_pool)).toBe(ENTRY_FEE);

    const readyEntry = await entryOf(raceId, readyPlayer.playerId);
    expect(readyEntry.status).toBe('ready');
    expect(readyEntry.horse_snapshot).not.toBeNull();

    for (const [player, before] of [
      [waitingPlayer, waitingMoneyBefore],
      [notReadyPlayer, notReadyMoneyBefore],
    ] as const) {
      const entry = await entryOf(raceId, player.playerId);
      expect(entry.status).toBe('cancelled');
      expect(entry.horse_snapshot).toBeNull();
      expect(await moneyOf(player.playerId)).toBe(before + ENTRY_FEE);
      expect(await refundsOf(raceId, player.playerId)).toEqual([ENTRY_FEE]);
    }

    // İkinci tur İKİNCİ iade yazmaz (yarış artık `locking`).
    await lockRaceUseCase.execute(new Date());
    expect(await refundsOf(raceId, waitingPlayer.playerId)).toEqual([ENTRY_FEE]);
  });

  it('scheduled yarış DOĞRUDAN kesinleşirse aynı kural: sonuçta yalnızca hazır oyuncu görünür', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Doğrudan Kuran');
    const readyPlayer = await registerTestPlayerWithStarterHorse(app, 'Doğrudan Hazır');
    const waitingPlayer = await registerTestPlayerWithStarterHorse(app, 'Doğrudan Bekleyen');
    const raceId = await createRace(creator);
    await join(readyPlayer, raceId);
    await join(waitingPlayer, raceId);
    await setReady(readyPlayer, raceId, 'ready');
    const waitingBefore = await moneyOf(waitingPlayer.playerId);
    await makeRaceStarted(raceId);

    const response = await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/settle`)
      .set('Authorization', creator.authHeader)
      .expect(200);

    const placePlayerIds = (response.body.data.places as Array<{ playerId: string | null }>)
      .map((place) => place.playerId)
      .filter((id): id is string => id !== null);
    expect(placePlayerIds).toEqual([readyPlayer.playerId]);
    expect((await raceRowOf(raceId)).status).toBe('finished');
    expect((await entryOf(raceId, waitingPlayer.playerId)).status).toBe('cancelled');
    expect(await moneyOf(waitingPlayer.playerId)).toBe(waitingBefore + ENTRY_FEE);
    expect(await refundsOf(raceId, waitingPlayer.playerId)).toEqual([ENTRY_FEE]);
  });

  it('HİÇ hazır oyuncu yoksa yarış iptal olur, herkes iade alır ve kesinleşme 409 döner', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Boş Hazırlık Kuran');
    const first = await registerTestPlayerWithStarterHorse(app, 'Hazır Olmayan 1');
    const second = await registerTestPlayerWithStarterHorse(app, 'Hazır Olmayan 2');
    const raceId = await createRace(creator);
    await join(first, raceId);
    await join(second, raceId);
    const firstBefore = await moneyOf(first.playerId);
    const secondBefore = await moneyOf(second.playerId);
    await makeRaceStarted(raceId);

    await lockUntilLeftScheduled(raceId);

    const row = await raceRowOf(raceId);
    expect(row.status).toBe('cancelled');
    expect(Number(row.prize_pool)).toBe(0);
    expect(await moneyOf(first.playerId)).toBe(firstBefore + ENTRY_FEE);
    expect(await moneyOf(second.playerId)).toBe(secondBefore + ENTRY_FEE);

    const settle = await request(app.getHttpServer())
      .post(`${racesUrl}/${raceId}/settle`)
      .set('Authorization', creator.authHeader)
      .expect(409);
    expect(settle.body.error.code).toBe('RACE_NOT_SETTLEABLE');
    expect(await refundsOf(raceId, first.playerId)).toEqual([ENTRY_FEE]);
  });
});
