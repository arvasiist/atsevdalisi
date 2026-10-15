import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadHorseGrowthConfig, loadRaceConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { applyRacingAgeFactor, getLifeStage } from '../../src/domain/horse/age-curve';
import { STARTER_HORSE_AGE_MONTHS } from '../../src/domain/horse/horse';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * 15.10.2026 — B12 (`docs/OYUN_DONGUSU_DENETIMI.md`): yarış için asgari yaş.
 * Hızlı yaşla (S5) birlikte tay doğar doğmaz koşabiliyordu; artık bütün yarış
 * yollarının ortak hazırlık kapısı yaşı da sorar ve paradan ÖNCE keser.
 */
const MIN_AGE = loadRaceConfig().readiness.minAgeMonths;
const GROWTH = loadHorseGrowthConfig();
const SCALE = GROWTH.gameMonthsPerRealDay;
/** B13 — yaşlılık evresinin başladığı ay ve yarış çarpanı (config'ten). */
const AGING_STAGE = GROWTH.stages.find((stage) => stage.name === 'aging')!;

describe('Yarış yaşı (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Test kısayolu: atı bugün doğmuş bir tay yapar (çıpa = şimdi, yaş 0). */
  async function makeFoal(horseId: string): Promise<void> {
    await pool.query('UPDATE horses SET birth_date = CURRENT_DATE, aging_started_at = now() WHERE id = $1', [horseId]);
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

  it('tay pratik yarışa giremez (409 HORSE_TOO_YOUNG, para düşmez); yaşı dolunca girer', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Tay Sahibi');
    await pool.query('UPDATE players SET money = 10000 WHERE id = $1', [player.playerId]);
    await makeFoal(player.horseId);
    const before = await money(player.playerId);

    const blocked = await practice(player);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('HORSE_TOO_YOUNG');
    expect(blocked.body.error.message).toMatch(/yarış yaşına/);
    expect(await money(player.playerId)).toBe(before);

    // Yaşı gelmiş gibi: doğum ve çıpa BİRLİKTE geri alınır (CLAUDE.md (90)).
    const days = Math.ceil(MIN_AGE / SCALE);
    await pool.query(
      `UPDATE horses SET birth_date = birth_date - $2::int,
                         aging_started_at = aging_started_at - make_interval(days => $2)
       WHERE id = $1`,
      [player.horseId, days],
    );
    await practice(player).expect(200);
  });

  it('tay lobi yarışına katılamaz (409 HORSE_TOO_YOUNG, katılım ücreti alınmaz)', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Yarış Açan');
    const owner = await registerTestPlayerWithStarterHorse(app, 'Tayıyla Gelen');
    await pool.query('UPDATE players SET money = 10000 WHERE id = $1', [owner.playerId]);
    await makeFoal(owner.horseId);
    const created = await request(app.getHttpServer())
      .post('/api/v1/races')
      .set('Authorization', creator.authHeader)
      .send({
        name: 'Tay Kupası',
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
    const before = await money(owner.playerId);

    const joined = await request(app.getHttpServer())
      .post(`/api/v1/races/${created.body.data.id}/join`)
      .set('Authorization', owner.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: owner.horseId });
    expect(joined.status).toBe(409);
    expect(joined.body.error.code).toBe('HORSE_TOO_YOUNG');
    expect(await money(owner.playerId)).toBe(before);
  });

  it('B13 — yaşlı at: liste evreyi ve etkin gücü gösterir; kadroya yaş çarpanıyla donar, zirvedeki at donmaz', async () => {
    const veteran = await registerTestPlayerWithStarterHorse(app, 'Emektar Sahibi');
    const youngster = await registerTestPlayerWithStarterHorse(app, 'Zirve Sahibi');
    // Zamanın geçişini taklit: doğum ve çıpa BİRLİKTE geri alınır (bkz. CLAUDE.md (90)).
    const days = Math.ceil((AGING_STAGE.minAgeMonths - STARTER_HORSE_AGE_MONTHS + 4) / SCALE);
    await pool.query(
      `UPDATE horses SET aging_started_at = aging_started_at - make_interval(days => $2::int),
                         birth_date = birth_date - $2::int
       WHERE id = $1`,
      [veteran.horseId, days],
    );
    const raw = async (horseId: string) =>
      (
        await pool.query<{ speed: string; stamina: string; acceleration: string }>(
          'SELECT speed, stamina, acceleration FROM horse_stats WHERE horse_id = $1',
          [horseId],
        )
      ).rows[0]!;
    const veteranStats = await raw(veteran.horseId);
    const youngStats = await raw(youngster.horseId);

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/horses?ownerId=${veteran.playerId}`)
      .set('Authorization', veteran.authHeader)
      .expect(200);
    const row = (listed.body.data as Array<Record<string, unknown>>).find((horse) => horse.id === veteran.horseId)!;
    expect(row.lifeStage).toEqual({ name: 'aging', racingFactor: AGING_STAGE.racingFactor });
    const rawPower = (Number(veteranStats.speed) + Number(veteranStats.stamina) + Number(veteranStats.acceleration)) / 3;
    expect(row.racingPower as number).toBeCloseTo(rawPower * AGING_STAGE.racingFactor, 6);
    expect(getLifeStage(STARTER_HORSE_AGE_MONTHS, GROWTH).racingFactor).toBe(1);

    const created = await request(app.getHttpServer())
      .post('/api/v1/races')
      .set('Authorization', veteran.authHeader)
      .send({
        name: 'Emektarlar Kupası',
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
    for (const player of [veteran, youngster]) {
      await request(app.getHttpServer())
        .post(`/api/v1/races/${raceId}/join`)
        .set('Authorization', player.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({ horseId: player.horseId })
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/races/${raceId}/ready`)
        .set('Authorization', player.authHeader)
        .send({ status: 'ready' })
        .expect(200);
    }
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);
    const settled = await request(app.getHttpServer())
      .post(`/api/v1/races/${raceId}/settle`)
      .set('Authorization', youngster.authHeader)
      .expect(200);
    const places = settled.body.data.places as Array<{ horseId: string; startingStats: Record<string, number> }>;
    const veteranPlace = places.find((place) => place.horseId === veteran.horseId)!;
    const youngPlace = places.find((place) => place.horseId === youngster.horseId)!;
    for (const stat of ['speed', 'stamina', 'acceleration'] as const) {
      expect(veteranPlace.startingStats[stat]).toBe(applyRacingAgeFactor(Number(veteranStats[stat]), AGING_STAGE.racingFactor));
      expect(youngPlace.startingStats[stat]).toBe(Number(youngStats[stat]));
    }
    // Canlı stat DEĞİŞMEDİ: yaş etkisi yalnızca kadroya donar (geri alınabilir, kalıcı kayıp yok).
    expect(await raw(veteran.horseId)).toEqual(veteranStats);
  });
});
