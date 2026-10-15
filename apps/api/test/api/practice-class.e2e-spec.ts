import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RaceEntrantSnapshot } from '@at-sevdalisi/shared-types';
import { loadEconomyConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { findPracticeRaceClass } from '../../src/domain/race/practice-class';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * 14.10.2026 — PRATİK YARIŞ SINIFLARI (`docs/OYUN_DONGUSU_DENETIMI.md` S2).
 * Kademe = sınıf: botlar kademenin güç aralığından üretilir; gücü kademe
 * tavanına ulaşan at o kademede koşamaz (para hareketinden ÖNCE 409).
 */
const ECONOMY = loadEconomyConfig();
const LOCAL = ECONOMY.raceTiers[0]!;
const LOCAL_CLASS = findPracticeRaceClass(ECONOMY, LOCAL.id)!;
const OPEN_TIER = ECONOMY.practiceRaceClasses.find((entry) => entry.maxHorsePower === null)!.tierId;

describe('Pratik yarış sınıfları (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  function practice(player: RegisteredTestPlayer & { horseId: string }, tierId: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/horses/${player.horseId}/practice-race`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ tierId });
  }

  async function money(playerId: string): Promise<number> {
    const result = await pool.query<{ money: string }>('SELECT money FROM players WHERE id = $1', [playerId]);
    return Number(result.rows[0]!.money);
  }

  it('botlar kademenin SINIF aralığındadır (eskiden her kademede 45–75)', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Sinif Botlari');
    const response = await practice(player, LOCAL.id).expect(200);
    const bots = await pool.query<{ horse_snapshot: RaceEntrantSnapshot }>(
      'SELECT horse_snapshot FROM race_entries WHERE race_id = $1 AND horse_id IS NULL',
      [response.body.data.raceId],
    );
    expect(bots.rows).toHaveLength(LOCAL.fieldSize - 1);
    const [low, high] = LOCAL_CLASS.botStatRange;
    for (const { horse_snapshot: bot } of bots.rows) {
      for (const value of [bot.speed, bot.stamina, bot.acceleration]) {
        expect(value).toBeGreaterThanOrEqual(low);
        expect(value).toBeLessThanOrEqual(high);
      }
    }
  });

  it('güçlü at alt kademeye GİREMEZ: 409, para ve yarış satırı yok; tavansız kademe açık', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Sinif Gucu');
    const power = LOCAL_CLASS.maxHorsePower!;
    await pool.query('UPDATE horse_stats SET speed = $2, acceleration = $2, stamina = $2 WHERE horse_id = $1', [
      player.horseId,
      power,
    ]);
    await pool.query('UPDATE players SET money = 100000 WHERE id = $1', [player.playerId]);
    const before = await money(player.playerId);
    const racesBefore = await pool.query('SELECT COUNT(*)::int AS n FROM race_entries WHERE horse_id = $1', [player.horseId]);

    const blocked = await practice(player, LOCAL.id).expect(409);
    expect(blocked.body.error.code).toBe('HORSE_TOO_STRONG_FOR_TIER');
    expect(await money(player.playerId)).toBe(before);
    const racesAfter = await pool.query('SELECT COUNT(*)::int AS n FROM race_entries WHERE horse_id = $1', [player.horseId]);
    expect(racesAfter.rows[0].n).toBe(racesBefore.rows[0].n);

    await practice(player, OPEN_TIER).expect(200);
  });

  it('ahır listesi atın sınıf gücünü taşır (hız + ivme + dayanıklılık ortalaması)', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Sinif Listesi');
    await pool.query('UPDATE horse_stats SET speed = 40, acceleration = 50, stamina = 60 WHERE horse_id = $1', [
      player.horseId,
    ]);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/horses?ownerId=${player.playerId}`)
      .set('Authorization', player.authHeader)
      .expect(200);
    const horse = (response.body.data as Array<{ id: string; racingPower?: number }>).find((h) => h.id === player.horseId)!;
    expect(horse.racingPower).toBe(50);
    // Herkese açık at ucu sınıf gücünü TAŞIMAZ (yalnızca sahibine).
    const publicView = await request(app.getHttpServer())
      .get(`/api/v1/horses/${player.horseId}`)
      .set('Authorization', player.authHeader)
      .expect(200);
    expect(publicView.body.data.racingPower).toBeUndefined();
  });
});
