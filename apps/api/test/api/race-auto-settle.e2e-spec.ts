import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { RaceLockScheduler } from '../../src/infrastructure/scheduler/race-lock.scheduler';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * OTOMATİK KESİNLEŞME (30.09.2026) — `RaceLockScheduler.tickNow()`.
 *
 * Bu dilimden önce zamanlayıcı yarışı yalnızca `locking`e geçiriyordu;
 * ödülü dağıtan tek yol `POST /races/:id/settle` crank'iydi ve onu çağıran
 * hiçbir istemci yoktu → kilitlenen yarışların giriş ücretleri havuzda
 * süresiz kalıyordu.
 *
 * **BU DOSYANIN KANITLADIĞI ŞEYLER:**
 *  1. Tek bir tur, başlangıç zamanı gelmiş yarışı `scheduled → locking →
 *     finished` taşır; her katılımcıya `race_finished` düşer.
 *  2. Zamanlayıcı ile crank aynı yarışa gelirse ÇİFT ÖDEME olmaz: crank
 *     sonrası tur yeni bir ödül satırı yazmaz; zamanlayıcı sonrası crank 409.
 *
 * Zamanlayıcı `NODE_ENV=test` altında kendi kendine koşmaz; `tickNow()`
 * elle çağrılır — çalışan kod yolu birebir aynıdır, saat testin elindedir.
 */
describe('Otomatik kesinleşme (e2e) — zamanlayıcı kilitler VE kesinleştirir', () => {
  let app: INestApplication;
  let pool: Pool;
  let scheduler: RaceLockScheduler;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    scheduler = app.get(RaceLockScheduler);
  });

  afterAll(async () => {
    await app.close();
  });

  const racesUrl = '/api/v1/races';
  const ENTRY_FEE = 100;

  async function createReadyRace(creator: RegisteredTestPlayer, racers: RegisteredTestPlayer[]): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(racesUrl)
      .set('Authorization', creator.authHeader)
      .send({
        name: 'Otomatik Kupa',
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
    const raceId = response.body.data.id as string;
    for (const racer of racers) {
      await request(app.getHttpServer())
        .post(`${racesUrl}/${raceId}/join`)
        .set('Authorization', racer.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({ horseId: racer.horseId })
        .expect(200);
      await request(app.getHttpServer())
        .post(`${racesUrl}/${raceId}/ready`)
        .set('Authorization', racer.authHeader)
        .send({ status: 'ready' })
        .expect(200);
    }
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);
    return raceId;
  }

  async function statusOf(raceId: string): Promise<string> {
    const result = await pool.query<{ status: string }>('SELECT status FROM races WHERE id = $1', [raceId]);
    return result.rows[0].status;
  }

  async function prizeRowCount(raceId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM economy_transactions WHERE reference_id = $1 AND type = 'lobby_race_prize'",
      [raceId],
    );
    return Number(result.rows[0].count);
  }

  /** Başka dosyaların vadesi gelmiş yarışları da sırada olabilir (batchSize) — bizimki bitene kadar tur at. */
  async function tickUntilFinished(raceId: string): Promise<void> {
    const MAX_TICKS = 25;
    for (let tick = 0; tick < MAX_TICKS; tick += 1) {
      await scheduler.tickNow();
      if ((await statusOf(raceId)) === 'finished') {
        return;
      }
    }
    throw new Error(`Yarış ${MAX_TICKS} turda kesinleşmedi: ${raceId}`);
  }

  it('tek tur yarışı scheduled → finished taşır ve ödülü deftere yazar', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Oto Kuran');
    const first = await registerTestPlayerWithStarterHorse(app, 'Oto Birinci');
    const second = await registerTestPlayerWithStarterHorse(app, 'Oto İkinci');
    const raceId = await createReadyRace(creator, [first, second]);
    expect(await statusOf(raceId)).toBe('scheduled');

    const result = await scheduler.tickNow();
    expect(result).not.toBeNull();
    if ((await statusOf(raceId)) !== 'finished') {
      await tickUntilFinished(raceId);
    }

    expect(await statusOf(raceId)).toBe('finished');
    // Ödül satırı SAYILMAZ: botlu sahada iki insan oyuncunun ödül bandı
    // dışında kalması meşrudur. Kesinleşmenin kanıtı: her gerçek
    // katılımcıya `race_finished` düşer ve sırası yazılır.
    const notified = await pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM notifications WHERE type = 'race_finished' AND payload->>'raceId' = $1",
      [raceId],
    );
    expect(Number(notified.rows[0].count)).toBe(2);
    const finished = await pool.query(
      'SELECT finish_position FROM race_entries WHERE race_id = $1 AND player_id IS NOT NULL',
      [raceId],
    );
    expect(finished.rows.every((row: { finish_position: number | null }) => row.finish_position !== null)).toBe(true);
  });

  it('crank ile zamanlayıcı ÇİFT ÖDEME üretmez (her iki sırada)', async () => {
    const creatorA = await registerTestPlayerWithStarterHorse(app, 'Çift Kuran A');
    const racerA = await registerTestPlayerWithStarterHorse(app, 'Çift Yarışçı A');
    const raceA = await createReadyRace(creatorA, [racerA]);

    // Önce crank, sonra zamanlayıcı: tur yeni ödül satırı YAZMAZ.
    await request(app.getHttpServer())
      .post(`${racesUrl}/${raceA}/settle`)
      .set('Authorization', creatorA.authHeader)
      .expect(200);
    const rowsAfterCrank = await prizeRowCount(raceA);
    await scheduler.tickNow();
    expect(await prizeRowCount(raceA)).toBe(rowsAfterCrank);

    // Önce zamanlayıcı, sonra crank: crank 409 döner.
    const creatorB = await registerTestPlayerWithStarterHorse(app, 'Çift Kuran B');
    const racerB = await registerTestPlayerWithStarterHorse(app, 'Çift Yarışçı B');
    const raceB = await createReadyRace(creatorB, [racerB]);
    await tickUntilFinished(raceB);
    const rowsAfterTick = await prizeRowCount(raceB);
    const crank = await request(app.getHttpServer())
      .post(`${racesUrl}/${raceB}/settle`)
      .set('Authorization', creatorB.authHeader)
      .expect(409);
    expect(crank.body.error.code).toBe('RACE_NOT_SETTLEABLE');
    expect(await prizeRowCount(raceB)).toBe(rowsAfterTick);
  });
});
