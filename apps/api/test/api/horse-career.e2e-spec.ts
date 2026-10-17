import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HORSE_VISIBLE_STAT_KEYS, type HorseCareerView } from '@at-sevdalisi/shared-types';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * 16.10.2026 — brief §3 "detaylı at profili ve geçmişi" + §6 "ataların
 * başarıları". Kazanç SAYAÇ değil, defterdeki ödül satırlarıdır: test toplamı
 * defterden bağımsız olarak yeniden okur ve karşılaştırır.
 */
describe('At kariyeri + görünür statlar (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  async function ledgerPrize(playerId: string, raceId: string): Promise<number> {
    const result = await pool.query<{ total: string | null }>(
      `SELECT SUM(amount) AS total FROM economy_transactions
       WHERE player_id = $1 AND reference_type = 'race' AND reference_id = $2
         AND type IN ('practice_race_prize', 'lobby_race_prize')`,
      [playerId, raceId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  it('koşusuz at: sıfır kariyer, herkese açık (token gerekmez); bilinmeyen at 404', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Kariyersiz');
    const response = await request(app.getHttpServer()).get(`/api/v1/horses/${player.horseId}/career`).expect(200);
    const career = response.body.data as HorseCareerView;
    expect(career).toMatchObject({
      horseId: player.horseId,
      starts: 0,
      wins: 0,
      places: 0,
      earnings: 0,
      foals: 0,
      bestPosition: null,
      recentRaces: [],
    });
    await request(app.getHttpServer()).get(`/api/v1/horses/${randomUUID()}/career`).expect(404);
  });

  it('pratik yarışlar kariyere girer; kazanç = defterdeki ödül, derece/saha sayısı yarıştan', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Kariyerli');
    await pool.query('UPDATE players SET money = 100000 WHERE id = $1', [player.playerId]);
    const raceIds: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/horses/${player.horseId}/practice-race`)
        .set('Authorization', player.authHeader)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(200);
      raceIds.push(response.body.data.raceId as string);
    }

    const response = await request(app.getHttpServer()).get(`/api/v1/horses/${player.horseId}/career`).expect(200);
    const career = response.body.data as HorseCareerView;
    expect(career.starts).toBe(2);
    expect(career.recentRaces).toHaveLength(2);
    expect(new Set(career.recentRaces.map((race) => race.raceId))).toEqual(new Set(raceIds));

    const positions = await pool.query<{ race_id: string; finish_position: number; field: string }>(
      `SELECT re.race_id, re.finish_position,
              (SELECT COUNT(*) FROM race_entries x WHERE x.race_id = re.race_id AND x.finish_position IS NOT NULL) AS field
       FROM race_entries re WHERE re.horse_id = $1`,
      [player.horseId],
    );
    let expectedEarnings = 0;
    for (const race of career.recentRaces) {
      const row = positions.rows.find((candidate) => candidate.race_id === race.raceId)!;
      expect(race.finishPosition).toBe(row.finish_position);
      expect(race.fieldSize).toBe(Number(row.field));
      expect(race.fieldSize).toBeGreaterThan(1);
      expect(typeof race.prize).toBe('number');
      expect(race.prize).toBe(await ledgerPrize(player.playerId, race.raceId));
      expectedEarnings += race.prize;
    }
    expect(career.earnings).toBe(expectedEarnings);
    expect(career.wins).toBe(positions.rows.filter((row) => row.finish_position === 1).length);
    expect(career.places).toBe(positions.rows.filter((row) => row.finish_position <= 3).length);
    expect(career.bestPosition).toBe(Math.min(...positions.rows.map((row) => row.finish_position)));

    // Soy ağacı: atın kendi özeti de döner (brief §6 — ataların başarıları aynı alandan).
    const pedigree = await request(app.getHttpServer()).get(`/api/v1/horses/${player.horseId}/pedigree`).expect(200);
    expect(pedigree.body.data.recordsById[player.horseId]).toMatchObject({ starts: 2, earnings: expectedEarnings });
  });

  it('sahibinin at listesi görünür statları taşır, gizli kişilik sayıları ve potansiyel SIZMAZ', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Statlı');
    const response = await request(app.getHttpServer())
      .get(`/api/v1/horses?ownerId=${player.playerId}`)
      .set('Authorization', player.authHeader)
      .expect(200);
    const horse = response.body.data[0];
    expect(Object.keys(horse.stats).sort()).toEqual([...HORSE_VISIBLE_STAT_KEYS].sort());
    const stored = await pool.query<{ speed: string; stamina: string; sprint: string }>(
      'SELECT speed, stamina, sprint FROM horse_stats WHERE horse_id = $1',
      [player.horseId],
    );
    expect(horse.stats.speed).toBe(Number(stored.rows[0]!.speed));
    expect(horse.stats.stamina).toBe(Number(stored.rows[0]!.stamina));
    expect(horse.stats.sprint).toBe(Number(stored.rows[0]!.sprint));
    // Kişilik yalnızca etiket olarak döner (`traits[].trait`), sayı olarak DEĞİL.
    for (const hidden of ['focus', 'courage', 'temperament', 'obedience', 'competitiveness', 'stressResistance']) {
      expect(horse.stats).not.toHaveProperty(hidden);
      expect(horse).not.toHaveProperty(hidden);
    }
    expect(horse).not.toHaveProperty('potential');
    // Herkese açık at ucu stat TAŞIMAZ.
    const publicView = await request(app.getHttpServer()).get(`/api/v1/horses/${player.horseId}`).expect(200);
    expect(publicView.body.data.stats).toBeUndefined();
  });
});
