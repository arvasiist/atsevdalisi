import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PeriodLeaderboardView } from '@at-sevdalisi/shared-types';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse } from './test-helpers';

/**
 * HAFTALIK / AYLIK SIRALAMA (02.10.2026, Faz 11). Kanıtlananlar: dönemdeki
 * yarış sayılır; pencerenin dışına itilen yarış (SQL ile 40 gün geri)
 * sayılmaz — "sıfırlama" veri silmeden pencereyle olur; geçersiz dönem 400.
 */
describe('Dönemsel sıralama (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (authHeader: string, period: string) =>
    request(app.getHttpServer()).get(`/api/v1/leaderboard/period/${period}`).set('Authorization', authHeader);

  it('dönemdeki yarış sayılır; pencere dışına itilen yarış sayılmaz', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Dönem Yarışçısı');
    const race = await request(app.getHttpServer())
      .post(`/api/v1/horses/${player.horseId}/practice-race`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    for (const period of ['weekly', 'monthly']) {
      const view = (await get(player.authHeader, period).expect(200)).body.data as PeriodLeaderboardView;
      expect(view.me).toMatchObject({ playerId: player.playerId, raceCount: 1 });
      expect(view.me!.score).toBeGreaterThan(0);
      expect(new Date(view.startsAt).getTime()).toBeLessThanOrEqual(Date.now());
      expect(new Date(view.endsAt).getTime()).toBeGreaterThan(Date.now());
    }
    await pool.query("UPDATE races SET start_time = now() - interval '40 days' WHERE id = $1", [race.body.data.raceId]);
    for (const period of ['weekly', 'monthly']) {
      expect((await get(player.authHeader, period).expect(200)).body.data.me).toBeNull();
    }
  });

  it('geçersiz dönem 400; oturumsuz 401', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Dönem Hata');
    await get(player.authHeader, 'daily').expect(400);
    await request(app.getHttpServer()).get('/api/v1/leaderboard/period/weekly').expect(401);
  });
});
