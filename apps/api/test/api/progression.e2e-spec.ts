import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadProgressionConfig } from '@at-sevdalisi/game-config';
import { applyXpGain, computeRaceXp } from '../../src/domain/progression/progression';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { RaceLockScheduler } from '../../src/infrastructure/scheduler/race-lock.scheduler';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * XP / SEVİYE İLERLEMESİ (01.10.2026).
 *
 * Bu dilimden önce `domain/progression` hiçbir yerden çağrılmıyordu:
 * oyuncular ve atlar sonsuza dek Seviye 1'de kalıyor, Gümüş (Sv. 15) ve
 * Altın (Sv. 30) turnuvalar kimseye açılamıyordu.
 *
 * **KANITLANAN:**
 *  1. Pratik yarış oyuncuya ve ata `xpRewards` tablosundaki XP'yi yazar;
 *     yanıttaki `xpGained` veritabanındaki artışla birebir aynıdır.
 *  2. Lobi yarışı kesinleşince HER gerçek katılımcı ve atı, kendi sırasına
 *     göre XP alır (ödemeyle aynı transaction).
 *  3. Antrenman ata ve oyuncuya `trainingSession` XP'si verir.
 *  4. Yeterli XP birikince seviye atlanır (XP eğrisi `applyXpGain`).
 *
 * Beklenen değerler sabit sayı DEĞİL, config + saf fonksiyonla hesaplanır:
 * ödül tablosu değişince test yanlış alarm vermez.
 */
describe('XP / seviye ilerlemesi (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let scheduler: RaceLockScheduler;
  const progression = loadProgressionConfig();

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    scheduler = app.get(RaceLockScheduler);
  });

  afterAll(async () => {
    await app.close();
  });

  async function progressOf(table: 'players' | 'horses', id: string): Promise<{ level: number; xp: number }> {
    const result = await pool.query<{ level: number; xp: string }>(`SELECT level, xp FROM ${table} WHERE id = $1`, [id]);
    return { level: result.rows[0].level, xp: Number(result.rows[0].xp) };
  }

  function expected(before: { level: number; xp: number }, gained: number): { level: number; xp: number } {
    const result = applyXpGain(before.level, before.xp, gained, progression);
    return { level: result.level, xp: result.xp };
  }

  it('pratik yarış oyuncuya ve ata sırasına göre XP yazar; yanıt ile veritabanı aynıdır', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'XP Pratik');
    const playerBefore = await progressOf('players', player.playerId);
    const horseBefore = await progressOf('horses', player.horseId);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/horses/${player.horseId}/practice-race`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);

    const position = (response.body.data.finalResult as Array<{ horseId: string; finishPosition: number }>).find(
      (entry) => entry.horseId === player.horseId,
    )?.finishPosition as number;
    const playerXp = computeRaceXp(position, progression.xpRewards.player);
    const horseXp = computeRaceXp(position, progression.xpRewards.horse);
    expect(response.body.data.xpGained).toEqual({ player: playerXp, horse: horseXp });
    expect(playerXp).toBeGreaterThan(0);

    expect(await progressOf('players', player.playerId)).toEqual(expected(playerBefore, playerXp));
    expect(await progressOf('horses', player.horseId)).toEqual(expected(horseBefore, horseXp));
  });

  it('yeterli XP birikince oyuncu seviye atlar (Sv. 1 sonsuza dek kalmaz)', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'XP Seviye');
    // Sv. 1 → 2 için gereken XP'nin bir eksiği: bir sonraki yarış kesinlikle atlatır.
    const needed = Math.round(progression.xpCurve.baseXpPerLevel * 1 ** progression.xpCurve.exponent);
    await pool.query('UPDATE players SET xp = $2 WHERE id = $1', [player.playerId, needed - 1]);

    await request(app.getHttpServer())
      .post(`/api/v1/horses/${player.horseId}/practice-race`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);

    expect((await progressOf('players', player.playerId)).level).toBeGreaterThanOrEqual(2);
  });

  it('lobi yarışı kesinleşince her gerçek katılımcı ve atı kendi sırasına göre XP alır', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'XP Kuran');
    const racers: RegisteredTestPlayer[] = [
      await registerTestPlayerWithStarterHorse(app, 'XP Lobi Bir'),
      await registerTestPlayerWithStarterHorse(app, 'XP Lobi İki'),
    ];
    const created = await request(app.getHttpServer())
      .post('/api/v1/races')
      .set('Authorization', creator.authHeader)
      .send({
        name: 'XP Kupası',
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
    const raceId = created.body.data.id as string;
    const before = new Map<string, { player: { level: number; xp: number }; horse: { level: number; xp: number } }>();
    for (const racer of racers) {
      before.set(racer.playerId, {
        player: await progressOf('players', racer.playerId),
        horse: await progressOf('horses', racer.horseId),
      });
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
    }
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);
    for (let tick = 0; tick < 25; tick += 1) {
      await scheduler.tickNow();
      const status = await pool.query<{ status: string }>('SELECT status FROM races WHERE id = $1', [raceId]);
      if (status.rows[0].status === 'finished') break;
    }

    for (const racer of racers) {
      const entry = await pool.query<{ finish_position: number }>(
        'SELECT finish_position FROM race_entries WHERE race_id = $1 AND player_id = $2',
        [raceId, racer.playerId],
      );
      const position = entry.rows[0].finish_position;
      expect(position).toBeGreaterThanOrEqual(1);
      const snapshot = before.get(racer.playerId)!;
      expect(await progressOf('players', racer.playerId)).toEqual(
        expected(snapshot.player, computeRaceXp(position, progression.xpRewards.player)),
      );
      expect(await progressOf('horses', racer.horseId)).toEqual(
        expected(snapshot.horse, computeRaceXp(position, progression.xpRewards.horse)),
      );
    }
    // Yarışı açan ama koşmayan oyuncu XP almaz.
    expect(await progressOf('players', creator.playerId)).toEqual({ level: 1, xp: 0 });
  });

  it('antrenman ata ve oyuncuya trainingSession XP verir', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'XP Antrenman');
    const playerBefore = await progressOf('players', player.playerId);
    const horseBefore = await progressOf('horses', player.horseId);

    await request(app.getHttpServer())
      .post(`/api/v1/horses/${player.horseId}/train`)
      .set('Authorization', player.authHeader)
      .send({ type: 'speed', intensity: 'low', durationMinutes: 30 })
      .expect(200);

    expect(await progressOf('horses', player.horseId)).toEqual(
      expected(horseBefore, progression.xpRewards.horse.trainingSession),
    );
    expect(await progressOf('players', player.playerId)).toEqual(
      expected(playerBefore, progression.xpRewards.player.trainingSession),
    );
  });
});
