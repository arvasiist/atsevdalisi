import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import { generateBotEntrants } from '../../src/domain/race/bot-generator';
import { findLevelBracket } from '../../src/domain/race/level-bracket';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * AT SEVİYESİ ARALIKLI YARIŞLAR (08.10.2026, migration 0073). Kanıtlananlar:
 * aralık yarışta saklanır ve lobide görünür; bilinmeyen aralık 400; aralık
 * dışı at 409 `HORSE_LEVEL_NOT_ALLOWED` alır ve ne para düşer ne katılım
 * yazılır; aralıklı yarışın botları aralığın gücündedir (aynı seed ile
 * yeniden üretilip yanıttaki sayılarla BİREBİR karşılaştırılır).
 */
describe('At seviyesi aralıklı yarışlar (e2e)', () => {
  const brackets = loadRaceLobbyConfig().horseLevelBrackets;
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
  const ENTRY_FEE = 50;

  function raceBody(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      name: 'Seviye Testi',
      fieldSize: 8,
      maxPlayers: 8,
      entryFee: ENTRY_FEE,
      raceType: 'paid',
      startTime: new Date(Date.now() + 120 * 1_000).toISOString(),
      surface: 'dirt',
      weather: 'sunny',
      distanceMeters: 1_200,
      tribuneFee: 0,
      spectatorCapacity: 500,
      ...override,
    };
  }

  const money = async (playerId: string) =>
    Number((await pool.query('SELECT money FROM players WHERE id = $1', [playerId])).rows[0].money);

  async function createRace(player: RegisteredTestPlayer, override: Record<string, unknown>): Promise<string> {
    return (await http().post('/api/v1/races').set('Authorization', player.authHeader).send(raceBody(override)).expect(201))
      .body.data.id as string;
  }

  it('aralık saklanır ve lobide görünür; bilinmeyen aralık 400; aralıksız yarış null', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Seviye Kuran');
    const created = await http()
      .post('/api/v1/races')
      .set('Authorization', creator.authHeader)
      .send(raceBody({ horseLevelBracket: 'rookie' }))
      .expect(201);
    expect(created.body.data.horseLevelBracket).toBe('rookie');
    const list = await http()
      .get('/api/v1/races')
      .query({ limit: String(loadRaceLobbyConfig().lobbyListMaxLimit) })
      .set('Authorization', creator.authHeader)
      .expect(200);
    const item = (list.body.data as Array<{ id: string; horseLevelBracket: string | null }>).find(
      (race) => race.id === created.body.data.id,
    );
    expect(item?.horseLevelBracket).toBe('rookie');

    const bad = await http()
      .post('/api/v1/races')
      .set('Authorization', creator.authHeader)
      .send(raceBody({ horseLevelBracket: 'efsane' }))
      .expect(400);
    expect(bad.body.error.code).toBe('INVALID_RACE_DEFINITION');

    const open = await http().post('/api/v1/races').set('Authorization', creator.authHeader).send(raceBody()).expect(201);
    expect(open.body.data.horseLevelBracket).toBeNull();
  });

  it('aralık dışı at 409 HORSE_LEVEL_NOT_ALLOWED — para düşmez, katılım yazılmaz; aralıktaki at girer', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Usta Kuran');
    const masterRace = await createRace(creator, { horseLevelBracket: 'master' });

    const rookie = await registerTestPlayerWithStarterHorse(app, 'Çaylak Sahibi');
    const before = await money(rookie.playerId);
    const rejected = await http()
      .post(`/api/v1/races/${masterRace}/join`)
      .set('Authorization', rookie.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: rookie.horseId })
      .expect(409);
    expect(rejected.body.error.code).toBe('HORSE_LEVEL_NOT_ALLOWED');
    expect(await money(rookie.playerId)).toBe(before);
    const entries = await pool.query('SELECT COUNT(*) FROM race_entries WHERE race_id = $1 AND player_id = $2', [
      masterRace,
      rookie.playerId,
    ]);
    expect(Number(entries.rows[0].count)).toBe(0);

    // Usta aralığındaki at girer.
    const master = findLevelBracket(brackets, 'master')!;
    const veteran = await registerTestPlayerWithStarterHorse(app, 'Usta Sahibi');
    await pool.query('UPDATE horses SET level = $2 WHERE id = $1', [veteran.horseId, master.minLevel]);
    const veteranBefore = await money(veteran.playerId);
    await http()
      .post(`/api/v1/races/${masterRace}/join`)
      .set('Authorization', veteran.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: veteran.horseId })
      .expect(200);
    expect(await money(veteran.playerId)).toBe(veteranBefore - ENTRY_FEE);
  });

  it('çaylak yarışının botları aralığın gücündedir (yeniden üretimle birebir)', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Çaylak Botları');
    const raceId = await createRace(creator, { horseLevelBracket: 'rookie' });
    await http()
      .post(`/api/v1/races/${raceId}/join`)
      .set('Authorization', creator.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: creator.horseId })
      .expect(200);
    await http()
      .post(`/api/v1/races/${raceId}/ready`)
      .set('Authorization', creator.authHeader)
      .send({ status: 'ready' })
      .expect(200);
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);

    const crank = await registerTestPlayerWithStarterHorse(app, 'Çaylak Krank');
    const settled = await http().post(`/api/v1/races/${raceId}/settle`).set('Authorization', crank.authHeader).expect(200);
    const bots = (
      settled.body.data.places as Array<{ horseId: string; participantType: 'human' | 'ai'; startingStats: Record<string, number> }>
    ).filter((place) => place.participantType === 'ai');
    expect(bots).toHaveLength(7);

    const range = findLevelBracket(brackets, 'rookie')!.botStatRange;
    const seed = (await pool.query('SELECT simulation_seed FROM races WHERE id = $1', [raceId])).rows[0]
      .simulation_seed as string;
    for (const bot of generateBotEntrants(7, seed, range)) {
      const place = bots.find((candidate) => candidate.horseId === bot.horseId)!;
      expect(place.startingStats.speed).toBe(bot.speed);
      expect(place.startingStats.stamina).toBe(bot.stamina);
      expect(place.startingStats.acceleration).toBe(bot.acceleration);
      for (const stat of ['speed', 'stamina', 'acceleration']) {
        expect(place.startingStats[stat]).toBeGreaterThanOrEqual(range[0]);
        expect(place.startingStats[stat]).toBeLessThanOrEqual(range[1]);
      }
    }
  });
});
