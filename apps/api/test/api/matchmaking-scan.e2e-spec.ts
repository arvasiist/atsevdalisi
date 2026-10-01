import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { AppConfigService } from '../../src/infrastructure/config/config.service';
import { MatchmakingScheduler } from '../../src/infrastructure/scheduler/matchmaking.scheduler';
import { bootstrapTestApp, registerTestPlayerWithStarterHorse, type RegisteredTestPlayer } from './test-helpers';

/**
 * EŞLEŞTİRME KUYRUĞU TARAMASI (30.09.2026, `FINAL_PROJECT_AUDIT.md` #21).
 *
 * Eşleştirme eskiden YALNIZCA katılım anında deneniyordu: reyting aralığı
 * bekleme süresiyle genişlese de, kuyrukta bekleyen iki oyuncu yeni biri
 * katılmadıkça hiç eşleşmiyordu.
 *
 * **KANITLANAN:** (1) katılım anında aralık dışında kalan iki oyuncu,
 * yeterince bekleyince TARAMA ile eşleşir (iki bilet silinir, `pvp_matches`
 * satırı yazılır); (2) yeterince beklemeden eşleşme olmaz; (3) atı bu
 * arada satılmış bilet düşürülür, başkasının atıyla eşleşme koşulmaz.
 *
 * `matchmaking_tickets` GLOBALDİR (bkz. `matchmaking.e2e-spec.ts`'in
 * `beforeEach` gerekçesi) — her testten önce boşaltılır.
 */
describe('Eşleştirme kuyruğu taraması (e2e) — MatchmakingScheduler.tickNow', () => {
  let app: INestApplication;
  let pool: Pool;
  let scheduler: MatchmakingScheduler;
  let config: AppConfigService;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    scheduler = app.get(MatchmakingScheduler);
    config = app.get(AppConfigService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM matchmaking_tickets');
  });

  async function queueWithRating(player: RegisteredTestPlayer, rating: number): Promise<void> {
    await pool.query('UPDATE players SET rating = $2 WHERE id = $1', [player.playerId, rating]);
    const response = await request(app.getHttpServer())
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', player.authHeader)
      .send({ horseId: player.horseId })
      .expect(201);
    expect(response.body.data.matched).toBe(false);
  }

  /** Katılım anında AYRI kalacak kadar uzak, maksimum aralığın İÇİNDE bir fark. */
  function ratingGap(): number {
    const { initialRatingRangeWidth, maxRatingRangeWidth } = config.online.matchmaking;
    return Math.floor((initialRatingRangeWidth + maxRatingRangeWidth) / 2);
  }

  /** Aralığın `ratingGap()`i kapsayacağı kadar ileri bir "şimdi". */
  function farFuture(): Date {
    const { initialRatingRangeWidth, rangeExpansionPerSecond } = config.online.matchmaking;
    const seconds = Math.ceil((ratingGap() - initialRatingRangeWidth) / rangeExpansionPerSecond) + 1;
    return new Date(Date.now() + seconds * 1000);
  }

  async function ticketCount(): Promise<number> {
    const result = await pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM matchmaking_tickets');
    return Number(result.rows[0].count);
  }

  async function matchesBetween(a: string, b: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM pvp_matches
       WHERE (player_a_id = $1 AND player_b_id = $2) OR (player_a_id = $2 AND player_b_id = $1)`,
      [a, b],
    );
    return Number(result.rows[0].count);
  }

  it('katılımda eşleşmeyen iki bekleyen, aralık genişleyince TARAMA ile eşleşir', async () => {
    const low = await registerTestPlayerWithStarterHorse(app, 'Tarama Alçak');
    const high = await registerTestPlayerWithStarterHorse(app, 'Tarama Yüksek');
    await queueWithRating(low, 1000);
    await queueWithRating(high, 1000 + ratingGap());
    expect(await ticketCount()).toBe(2);

    const result = await scheduler.tickNow(farFuture());

    expect(result).toEqual({ matched: 1 });
    expect(await ticketCount()).toBe(0);
    expect(await matchesBetween(low.playerId, high.playerId)).toBe(1);
  });

  it('yeterince beklemeden tarama eşleştirmez — biletler kuyrukta kalır', async () => {
    const low = await registerTestPlayerWithStarterHorse(app, 'Sabırsız Alçak');
    const high = await registerTestPlayerWithStarterHorse(app, 'Sabırsız Yüksek');
    await queueWithRating(low, 1000);
    await queueWithRating(high, 1000 + ratingGap());

    const result = await scheduler.tickNow(new Date());

    expect(result).toEqual({ matched: 0 });
    expect(await ticketCount()).toBe(2);
    expect(await matchesBetween(low.playerId, high.playerId)).toBe(0);
  });

  it('atı bu arada SATILMIŞ bilet düşürülür — başkasının atıyla eşleşme koşulmaz', async () => {
    const seller = await registerTestPlayerWithStarterHorse(app, 'Bayat Satıcı');
    const other = await registerTestPlayerWithStarterHorse(app, 'Bayat Rakip');
    const buyer = await registerTestPlayerWithStarterHorse(app, 'Bayat Alıcı');
    await queueWithRating(seller, 1000);
    await queueWithRating(other, 1000 + ratingGap());
    await pool.query('UPDATE horses SET owner_id = $2 WHERE id = $1', [seller.horseId, buyer.playerId]);

    const result = await scheduler.tickNow(farFuture());

    expect(result).toEqual({ matched: 0 });
    expect(await matchesBetween(seller.playerId, other.playerId)).toBe(0);
    const remaining = await pool.query<{ player_id: string }>('SELECT player_id FROM matchmaking_tickets');
    expect(remaining.rows.map((row) => row.player_id)).toEqual([other.playerId]);
  });
});
