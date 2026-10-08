import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { loadRaceLobbyConfig } from '@at-sevdalisi/game-config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findHippodrome, pickHippodromeForRace } from '../../src/domain/race/hippodrome';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * HİPODROMLAR (08.10.2026, migration 0072). Kanıtlananlar: lobi yarışı
 * seçilen hipodromla açılır (satırda `track_id`, yanıtta ve lobi listesinde
 * anahtar); seçim yoksa varsayılan; bilinmeyen hipodrom 400 ve satır
 * YAZILMAZ; pratik yarış hipodromu yarış kimliğinden determinist alır ve
 * tekrar (zaman çizelgesi) aynı hipodromu gösterir.
 */
describe('Hipodromlar (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let config: AppConfigService;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    config = app.get(AppConfigService);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  function raceBody(extra: Record<string, unknown>): Record<string, unknown> {
    return {
      name: 'Hipodrom Kupası',
      fieldSize: 8,
      maxPlayers: 8,
      entryFee: 0,
      raceType: 'free',
      // 120 sn: diğer dosyalar yarışlarını +1 saatle açar; liste `start_time ASC`
      // ve sınırlı olduğundan erken başlayan yarış birikmiş veride de görünür
      // (`race-lobby-list.e2e-spec.ts` ile aynı gerekçe).
      startTime: new Date(Date.now() + 120 * 1_000).toISOString(),
      surface: 'dirt',
      weather: 'sunny',
      distanceMeters: 1_400,
      tribuneFee: 0,
      spectatorCapacity: 500,
      ...extra,
    };
  }

  const trackIdOf = async (raceId: string) =>
    (
      await pool.query<{ track_id: string | null }>('SELECT track_id FROM races WHERE id = $1', [
        raceId,
      ])
    ).rows[0]?.track_id;

  it('lobi yarışı seçilen hipodromda açılır; listede de aynı anahtar görünür', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'İzmirli Organizatör');
    const created = await http()
      .post('/api/v1/races')
      .set('Authorization', player.authHeader)
      .send(raceBody({ hippodrome: 'izmir' }))
      .expect(201);
    const raceId = created.body.data.id as string;
    expect(created.body.data.hippodrome).toBe('izmir');
    expect(await trackIdOf(raceId)).toBe(findHippodrome(config.hippodromes, 'izmir')!.trackId);

    const list = await http()
      .get('/api/v1/races')
      .query({ limit: String(loadRaceLobbyConfig().lobbyListMaxLimit) })
      .set('Authorization', player.authHeader)
      .expect(200);
    const row = (list.body.data as Array<{ id: string; hippodrome: string }>).find(
      (race) => race.id === raceId,
    );
    expect(row?.hippodrome).toBe('izmir');
  });

  it('hipodrom seçilmezse varsayılan; bilinmeyen hipodrom 400 ve satır yazılmaz', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Varsayılan Organizatör');
    const plain = await http()
      .post('/api/v1/races')
      .set('Authorization', player.authHeader)
      .send(raceBody({}))
      .expect(201);
    expect(plain.body.data.hippodrome).toBe(config.hippodromes.defaultKey);

    const before = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM races WHERE created_by = $1',
      [player.playerId],
    );
    const rejected = await http()
      .post('/api/v1/races')
      .set('Authorization', player.authHeader)
      .send(raceBody({ hippodrome: 'ay-pisti' }))
      .expect(400);
    expect(rejected.body.error.code).toBe('INVALID_RACE_DEFINITION');
    const after = await pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM races WHERE created_by = $1',
      [player.playerId],
    );
    expect(Number(after.rows[0]!.count)).toBe(Number(before.rows[0]!.count));
  });

  it('pratik yarışın hipodromu kimlikten determinist; tekrar aynı hipodromu gösterir', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Pratik Hipodrom');
    const response = await http()
      .post(`/api/v1/horses/${player.horseId}/practice-race`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    const raceId = response.body.data.raceId as string;
    const expected = pickHippodromeForRace(config.hippodromes, raceId);
    expect(await trackIdOf(raceId)).toBe(expected.trackId);

    const timeline = await http()
      .get(`/api/v1/races/${raceId}/timeline`)
      .set('Authorization', player.authHeader)
      .expect(200);
    expect(timeline.body.data.hippodrome).toBe(expected.key);
  });
});
