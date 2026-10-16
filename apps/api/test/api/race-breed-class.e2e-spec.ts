import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadBreedsConfig } from '@at-sevdalisi/game-config';
import { findRaceClass, raceClassBotStatRange } from '../../src/domain/horse/breeds';
import { generateBotEntrants } from '../../src/domain/race/bot-generator';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { allowSoloLobbyRace, bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * IRKA ÖZEL YARIŞLAR (08.10.2026, migration 0070). Kanıtlananlar: sınıf
 * yarışın üstünde saklanır ve lobide görünür; bilinmeyen sınıf 400; sınıf
 * dışı at 409 `HORSE_BREED_NOT_ALLOWED` alır ve ne para düşer ne katılım
 * yazılır; sınıflı yarışın botları sınıfın ırkları gücündedir (aynı seed ile
 * yeniden üretilip yanıttaki sayılarla BİREBİR karşılaştırılır — "AI'ye
 * gizli bonus" kâhiniyle aynı desen).
 */
describe('Irka özel yarışlar (e2e)', () => {
  const breeds = loadBreedsConfig();
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
  const ENTRY_FEE = 100;

  function raceBody(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      name: 'Yerli Irklar Testi',
      fieldSize: 8,
      maxPlayers: 8,
      entryFee: ENTRY_FEE,
      raceType: 'paid',
      startTime: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
      surface: 'dirt',
      weather: 'sunny',
      distanceMeters: 1_400,
      tribuneFee: 0,
      spectatorCapacity: 500,
      ...override,
    };
  }

  const money = async (playerId: string) =>
    Number((await pool.query('SELECT money FROM players WHERE id = $1', [playerId])).rows[0].money);

  async function joinAndReady(player: RegisteredTestPlayer, raceId: string, horseId: string): Promise<void> {
    await http()
      .post(`/api/v1/races/${raceId}/join`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId })
      .expect(200);
    await http()
      .post(`/api/v1/races/${raceId}/ready`)
      .set('Authorization', player.authHeader)
      .send({ status: 'ready' })
      .expect(200);
  }

  it('sınıf yarışta saklanır ve lobide görünür; bilinmeyen sınıf 400; açık yarış null', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Sınıf Kuran');
    const created = await http()
      .post('/api/v1/races')
      .set('Authorization', creator.authHeader)
      .send(raceBody({ breedClass: 'native' }))
      .expect(201);
    expect(created.body.data.breedClass).toBe('native');
    const row = await pool.query('SELECT breed_class FROM races WHERE id = $1', [created.body.data.id]);
    expect(row.rows[0].breed_class).toBe('native');

    // Paylaşılan DB'de biriken yarışlar liste sınırını doldurabilir: bu
    // satır başlangıç sırasıyla başa alınır (iddia sınıfın listede taşınması).
    await pool.query("UPDATE races SET start_time = now() - interval '10 years' WHERE id = $1", [created.body.data.id]);
    const list = await http()
      .get('/api/v1/races')
      .query({ limit: '100' })
      .set('Authorization', creator.authHeader)
      .expect(200);
    const item = (list.body.data as Array<{ id: string; breedClass: string | null }>).find(
      (race) => race.id === created.body.data.id,
    );
    expect(item?.breedClass).toBe('native');

    const bad = await http()
      .post('/api/v1/races')
      .set('Authorization', creator.authHeader)
      .send(raceBody({ breedClass: 'unicorn' }))
      .expect(400);
    expect(JSON.stringify(bad.body)).toContain('Irk sınıfı');

    const open = await http().post('/api/v1/races').set('Authorization', creator.authHeader).send(raceBody()).expect(201);
    expect(open.body.data.breedClass).toBeNull();
  });

  it('sınıf dışı at 409 HORSE_BREED_NOT_ALLOWED — para düşmez, katılım yazılmaz; sınıftaki at girer', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Sınıf Kapısı');
    const raceId = (
      await http().post('/api/v1/races').set('Authorization', creator.authHeader).send(raceBody({ breedClass: 'native' })).expect(201)
    ).body.data.id as string;

    const outsider = await registerTestPlayerWithStarterHorse(app, 'İngiliz Sahibi');
    await pool.query("UPDATE horses SET breed = 'thoroughbred' WHERE id = $1", [outsider.horseId]);
    const before = await money(outsider.playerId);
    const rejected = await http()
      .post(`/api/v1/races/${raceId}/join`)
      .set('Authorization', outsider.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({ horseId: outsider.horseId })
      .expect(409);
    expect(rejected.body.error.code).toBe('HORSE_BREED_NOT_ALLOWED');
    expect(await money(outsider.playerId)).toBe(before);
    const entries = await pool.query('SELECT COUNT(*) FROM race_entries WHERE race_id = $1 AND player_id = $2', [
      raceId,
      outsider.playerId,
    ]);
    expect(Number(entries.rows[0].count)).toBe(0);

    // Başlangıç atı (en zayıf ırk) yerli sınıftadır → girer, ücreti öder.
    const native = findRaceClass(breeds, 'native')!;
    expect(native.breeds).toContain(breeds.starterBreed);
    const local = await registerTestPlayerWithStarterHorse(app, 'Yerli Sahibi');
    const localBefore = await money(local.playerId);
    await joinAndReady(local, raceId, local.horseId);
    expect(await money(local.playerId)).toBe(localBefore - ENTRY_FEE);
  });

  it('sınıflı yarışın botları sınıfın ırkları gücündedir; açık yarışınki değişmez', async () => {
    const creator = await registerTestPlayerWithStarterHorse(app, 'Sınıf Botları');
    const raceId = (
      await http().post('/api/v1/races').set('Authorization', creator.authHeader).send(raceBody({ breedClass: 'native' })).expect(201)
    ).body.data.id as string;
    await joinAndReady(creator, raceId, creator.horseId);
    await pool.query("UPDATE races SET start_time = now() - interval '1 minute' WHERE id = $1", [raceId]);
    // Tek gerçek oyuncu: eski saha kuralı ön koşul olarak kurulur (bkz. `allowSoloLobbyRace`).
    await allowSoloLobbyRace(app, raceId);

    const crank = await registerTestPlayerWithStarterHorse(app, 'Sınıf Krank');
    const settled = await http().post(`/api/v1/races/${raceId}/settle`).set('Authorization', crank.authHeader).expect(200);
    const places = settled.body.data.places as Array<{
      horseId: string;
      participantType: 'human' | 'ai';
      startingStats: Record<string, number>;
    }>;
    const bots = places.filter((place) => place.participantType === 'ai');
    expect(bots).toHaveLength(7);

    const range = raceClassBotStatRange(breeds, 'native')!;
    const seed = (await pool.query('SELECT simulation_seed FROM races WHERE id = $1', [raceId])).rows[0]
      .simulation_seed as string;
    const expected = generateBotEntrants(7, seed, range);
    for (const bot of expected) {
      const place = bots.find((candidate) => candidate.horseId === bot.horseId)!;
      expect(place.startingStats.speed).toBe(bot.speed);
      expect(place.startingStats.stamina).toBe(bot.stamina);
      expect(place.startingStats.acceleration).toBe(bot.acceleration);
      for (const stat of ['speed', 'stamina', 'acceleration']) {
        expect(place.startingStats[stat]).toBeGreaterThanOrEqual(range[0]);
        expect(place.startingStats[stat]).toBeLessThanOrEqual(range[1]);
      }
    }
    // Yerli sınıfın tavanı genel bot aralığının tavanından (75) düşüktür —
    // aksi hâlde "yerli" koşu yine güçlü botlarla dolardı.
    expect(range[1]).toBeLessThan(75);
    // Açık yarış (sınıfsız) aynı seed'le genel aralığı üretir: varsayılan yol değişmedi.
    expect(generateBotEntrants(7, seed)).not.toEqual(expected);
  });
});
