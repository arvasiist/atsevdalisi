import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCareConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { HorseRecoveryScheduler } from '../../src/infrastructure/scheduler/horse-recovery.scheduler';
import { RaceLockScheduler } from '../../src/infrastructure/scheduler/race-lock.scheduler';
import { computeRaceConditionCost } from '../../src/domain/care/race-condition';
import { PRACTICE_RACE_DISTANCE_METERS } from '../../src/domain/race/validation';
import { allowSoloLobbyRace, bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * 15.10.2026 — S3 (`docs/OYUN_DONGUSU_DENETIMI.md` B2/B3). Eskiden 12 ardışık
 * pratik yarışta atın enerjisi 100, yorgunluğu 0 kalıyordu. Artık yarış
 * (pratik, lobi, PvP) sonuçla aynı transaction'da bedel yazar ve zamanlayıcı
 * atı zamanla toparlar.
 *
 * ⚠️ `tickNow` bütün atları toparlar; API paketi `--no-file-parallelism` ile
 * koştuğu için başka dosyanın atlarını yarışın ortasında etkilemez.
 */
const CARE = loadCareConfig();
const PRACTICE_COST = computeRaceConditionCost(PRACTICE_RACE_DISTANCE_METERS, CARE.raceCondition);
const MAX_CREDIT_HOURS = CARE.passiveRecovery.maxCreditSeconds / 3600;

describe('Yarış bedeli + zamanla toparlanma (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let recovery: HorseRecoveryScheduler;
  let lockScheduler: RaceLockScheduler;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    recovery = app.get(HorseRecoveryScheduler);
    lockScheduler = app.get(RaceLockScheduler);
  });

  afterAll(async () => {
    await app.close();
  });

  async function vitals(horseId: string): Promise<{ energy: number; fatigue: number }> {
    const result = await pool.query<{ energy: string; fatigue: string }>(
      'SELECT energy, fatigue FROM horses WHERE id = $1',
      [horseId],
    );
    return { energy: Number(result.rows[0]!.energy), fatigue: Number(result.rows[0]!.fatigue) };
  }

  async function money(playerId: string): Promise<number> {
    const result = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [playerId]);
    return Number(result.rows[0]!.money);
  }

  function practice(player: RegisteredTestPlayer & { horseId: string }) {
    return request(app.getHttpServer())
      .post(`/api/v1/horses/${player.horseId}/practice-race`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({});
  }

  it('pratik yarış enerji yakar + yorgunluk ekler; art arda yarışan at hazırlık kapısına takılır (para düşmez)', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Yorgun At');
    await pool.query('UPDATE players SET money = 100000 WHERE id = $1', [player.playerId]);
    expect(await vitals(player.horseId)).toEqual({ energy: 100, fatigue: 0 });

    await practice(player).expect(200);
    expect(await vitals(player.horseId)).toEqual({ energy: 100 - PRACTICE_COST.energy, fatigue: PRACTICE_COST.fatigue });

    let races = 1;
    let blocked: request.Response | null = null;
    while (races < 10) {
      const response = await practice(player);
      if (response.status !== 200) {
        blocked = response;
        break;
      }
      races += 1;
    }
    expect(races).toBeGreaterThanOrEqual(2);
    expect(races).toBeLessThanOrEqual(4);
    expect(blocked?.status).toBe(409);
    expect(['HORSE_TOO_TIRED', 'INSUFFICIENT_ENERGY']).toContain(blocked?.body.error.code);

    // Engellenen istek para hareketi üretmez.
    const before = await money(player.playerId);
    await practice(player).expect(409);
    expect(await money(player.playerId)).toBe(before);

    // Ahır listesi ne zaman hazır olacağını söyler (yalnızca sahibine).
    const list = await request(app.getHttpServer())
      .get(`/api/v1/horses?ownerId=${player.playerId}`)
      .set('Authorization', player.authHeader)
      .expect(200);
    const horse = (list.body.data as Array<{ id: string; raceReadyAt?: string }>).find((h) => h.id === player.horseId)!;
    expect(new Date(horse.raceReadyAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it('toparlanma turu geçen süre kadar toparlar, bir tur en fazla `maxCreditSeconds` sayar, aynı an iki kez sayılmaz', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Dinlenen At');
    const start = new Date();
    await pool.query(
      'UPDATE horses SET energy = 20, fatigue = 80, vitals_recovered_at = $2 WHERE id = $1',
      [player.horseId, start],
    );

    // Bir saat sonra koşan TEK tur yalnızca `maxCreditSeconds` sayar.
    const later = new Date(start.getTime() + 3600 * 1000);
    await recovery.tickNow(later);
    const credited = MAX_CREDIT_HOURS;
    expect(await vitals(player.horseId)).toEqual({
      energy: Math.round((20 + CARE.passiveRecovery.energyPerHour * credited) * 100) / 100,
      fatigue: Math.round((80 - CARE.passiveRecovery.fatiguePerHour * credited) * 100) / 100,
    });

    // Aynı an ikinci tur hiçbir şey yazmaz (iki örnek / tekrar eden tur çift toparlanma veremez).
    const afterFirst = await vitals(player.horseId);
    await recovery.tickNow(later);
    expect(await vitals(player.horseId)).toEqual(afterFirst);

    // Yeterince tur sonra at tamamen toparlanır ve sınırda kalır.
    let clock = later.getTime();
    for (let tick = 0; tick < 200; tick += 1) {
      clock += CARE.passiveRecovery.tickSeconds * 1000;
      await recovery.tickNow(new Date(clock));
    }
    expect(await vitals(player.horseId)).toEqual({ energy: 100, fatigue: 0 });
  });

  it('lobi yarışı kesinleşince koşan atlara mesafeyle orantılı bedel yazılır', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Bedel Kuran');
    const racer = await registerTestPlayerWithStarterHorse(app, 'Bedel Koşan');
    const distanceMeters = 2_000;
    const created = await request(app.getHttpServer())
      .post('/api/v1/races')
      .set('Authorization', creator.authHeader)
      .send({
        name: 'Bedel Kupası',
        fieldSize: 8,
        maxPlayers: 8,
        entryFee: 100,
        raceType: 'paid',
        startTime: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        surface: 'grass',
        weather: 'sunny',
        distanceMeters,
        tribuneFee: 0,
        spectatorCapacity: 500,
      })
      .expect(201);
    const raceId = created.body.data.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/races/${raceId}/join`)
      .set('Authorization', racer.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: racer.horseId })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/races/${raceId}/ready`)
      .set('Authorization', racer.authHeader)
      .send({ status: 'ready' })
      .expect(200);
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);
    // Tek gerçek oyuncu: eski saha kuralı ön koşul olarak kurulur (bkz. `allowSoloLobbyRace`).
    await allowSoloLobbyRace(app, raceId);
    const before = await vitals(racer.horseId);

    for (let tick = 0; tick < 25; tick += 1) {
      await lockScheduler.tickNow();
      const status = await pool.query<{ status: string }>('SELECT status FROM races WHERE id = $1', [raceId]);
      if (status.rows[0]!.status === 'finished') break;
    }

    const cost = computeRaceConditionCost(distanceMeters, CARE.raceCondition);
    expect(cost.energy).toBeGreaterThan(PRACTICE_COST.energy);
    expect(await vitals(racer.horseId)).toEqual({
      energy: Math.round((before.energy - cost.energy) * 100) / 100,
      fatigue: Math.round((before.fatigue + cost.fatigue) * 100) / 100,
    });
    // Yarışa girmeyen (yalnızca açan) oyuncunun atı etkilenmez.
    expect(await vitals(creator.horseId)).toEqual({ energy: 100, fatigue: 0 });
  });
});
