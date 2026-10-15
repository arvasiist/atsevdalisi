import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadHorseGrowthConfig, loadRaceConfig } from '@at-sevdalisi/game-config';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * 15.10.2026 — B12 (`docs/OYUN_DONGUSU_DENETIMI.md`): yarış için asgari yaş.
 * Hızlı yaşla (S5) birlikte tay doğar doğmaz koşabiliyordu; artık bütün yarış
 * yollarının ortak hazırlık kapısı yaşı da sorar ve paradan ÖNCE keser.
 */
const MIN_AGE = loadRaceConfig().readiness.minAgeMonths;
const SCALE = loadHorseGrowthConfig().gameMonthsPerRealDay;

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
});
