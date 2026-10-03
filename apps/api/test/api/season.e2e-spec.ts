import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadOnlineConfig } from '@at-sevdalisi/game-config';
import type { SeasonView } from '@at-sevdalisi/shared-types';
import { buildLeaderboard, sumRankingScores } from '../../src/domain/ranking/leaderboard';
import { calculateRankingScore } from '../../src/domain/ranking/ranking-score';
import { PG_POOL } from '../../src/infrastructure/database/database.module';
import { SeasonScheduler } from '../../src/infrastructure/scheduler/season.scheduler';
import {
  bootstrapTestApp,
  registerTestPlayerWithStarterHorse,
  type RegisteredTestPlayer,
} from './test-helpers';

/**
 * SEZON (brief §69, migration 0050, 01.10.2026).
 *
 * **KANITLANAN:** güncel sezon kendiliğinden açılır ve ardışıktır; sezon
 * sıralaması genel formülle ama YALNIZCA pencere içindeki yarışlardan
 * hesaplanır; sezon bitince ödül sıraya göre ödenir (bakiye + `season_reward`
 * defter satırı + `rewards_paid_at` aynı transaction'da) ve İKİNCİ tur
 * hiçbir şey ödemez.
 *
 * Zaman: sezon bitişi gerçek zamanı beklemek yerine `tickNow(gelecek)` ile
 * simüle edilir. Beklenen ödüller domain fonksiyonlarıyla, veritabanından
 * okunan kayıtlardan bağımsız olarak hesaplanır.
 */
describe('Sezon (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  let scheduler: SeasonScheduler;
  const online = loadOnlineConfig();

  beforeAll(async () => {
    app = await bootstrapTestApp();
    pool = app.get<Pool>(PG_POOL);
    scheduler = app.get(SeasonScheduler);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function current(player: RegisteredTestPlayer): Promise<SeasonView> {
    return (
      await http()
        .get('/api/v1/seasons/current')
        .set('Authorization', player.authHeader)
        .expect(200)
    ).body.data;
  }

  async function practice(player: RegisteredTestPlayer & { horseId: string }) {
    const response = await http()
      .post(`/api/v1/horses/${player.horseId}/practice-race`)
      .set('Authorization', player.authHeader)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    return response.body.data as { raceId?: string; race?: { id: string } };
  }

  it("güncel sezon açılır; zamanlayıcı kapalıdır (test); sezon süresi config'ten", async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Sezon Açılış');
    expect(scheduler.isRunning()).toBe(false);
    const view = await current(player);
    expect(view.season.status).toBe('active');
    expect(Date.parse(view.season.endsAt) - Date.parse(view.season.startsAt)).toBe(
      online.season.durationDays * 24 * 60 * 60 * 1000,
    );
    expect(view.rewardsByRank).toEqual(online.season.rewardsByRank);
    expect(view.me).toBeNull();
  });

  it('sezon puanı = pencere içindeki yarışların puan toplamı; pencere dışı yarış sayılmaz', async () => {
    const player = await registerTestPlayerWithStarterHorse(app, 'Sezon Puan');
    await practice(player);
    await practice(player);

    const rows = await pool.query<{
      race_id: string;
      performance_score: string;
      finish_position: number;
    }>(
      `SELECT e.race_id, e.performance_score, e.finish_position
         FROM race_entries e WHERE e.horse_id = $1 AND e.finish_position IS NOT NULL ORDER BY e.created_at`,
      [player.horseId],
    );
    expect(rows.rows).toHaveLength(2);
    const scoreOf = (row: { performance_score: string; finish_position: number }) =>
      calculateRankingScore(
        {
          racePerformanceScore: Number(row.performance_score),
          isWin: row.finish_position === 1,
          placement: row.finish_position,
          tournamentBonus: 0,
        },
        online,
      );

    const both = await current(player);
    expect(both.me?.score).toBe(scoreOf(rows.rows[0]!) + scoreOf(rows.rows[1]!));
    expect(both.me?.raceCount).toBe(2);
    expect(both.me?.reward).toBe(online.season.rewardsByRank[(both.me?.rank ?? 0) - 1] ?? 0);

    // İlk yarışı sezon başlangıcından ÖNCEYE taşı → artık sayılmaz.
    await pool.query(
      "UPDATE races SET start_time = $2::timestamptz - interval '1 day' WHERE id = $1",
      [rows.rows[0]!.race_id, both.season.startsAt],
    );
    const one = await current(player);
    expect(one.me?.score).toBe(scoreOf(rows.rows[1]!));
    expect(one.me?.raceCount).toBe(1);
  });

  it('sezon bitince ödüller sıraya göre bir kez ödenir; yeni sezon kesintisiz başlar', async () => {
    const racers = [
      await registerTestPlayerWithStarterHorse(app, 'Sezon Ödül A'),
      await registerTestPlayerWithStarterHorse(app, 'Sezon Ödül B'),
    ];
    for (const racer of racers) {
      await practice(racer);
    }
    const before = await current(racers[0]!);
    const afterEnd = new Date(Date.parse(before.season.endsAt) + 60 * 60 * 1000);

    // Beklenen ödüller: penceredeki kayıtlardan, domain fonksiyonlarıyla bağımsız hesap.
    const records = (
      await pool.query<{
        owner_id: string;
        performance_score: string;
        finish_position: number;
        start_time: Date;
      }>(
        // 03.10.2026 (migration 0063): yarış KOŞTURAN oyuncunundur — at sonradan
        // satılmış olabilir (paylaşılan DB'de `player-journey` satıyor).
        `SELECT COALESCE(e.player_id, h.owner_id) AS owner_id, e.performance_score, e.finish_position, r.start_time
           FROM race_entries e JOIN races r ON r.id = e.race_id JOIN horses h ON h.id = e.horse_id
           JOIN players p ON p.id = COALESCE(e.player_id, h.owner_id)
          WHERE e.finish_position IS NOT NULL AND e.performance_score IS NOT NULL
            AND p.deleted_at IS NULL
            AND r.start_time >= $1 AND r.start_time < $2`,
        [before.season.startsAt, before.season.endsAt],
      )
    ).rows.map((row) => ({
      playerId: row.owner_id,
      performanceScore: Number(row.performance_score),
      finishPosition: row.finish_position,
      finishedAt: row.start_time.toISOString(),
    }));
    const ranked = buildLeaderboard(
      sumRankingScores(records, online).map((t) => ({
        playerId: t.playerId,
        scope: 'season' as const,
        scopeKey: null,
        score: t.score,
        updatedAt: t.lastFinishedAt,
      })),
    );
    const expected = new Map(
      ranked
        .map((entry) => [entry.playerId, online.season.rewardsByRank[entry.rank - 1] ?? 0] as const)
        .filter(([, amount]) => amount > 0),
    );
    expect(expected.size).toBeGreaterThan(0);
    const balances = async () =>
      new Map(
        (
          await pool.query<{ id: string; money: string }>(
            'SELECT id, money FROM players WHERE id = ANY($1)',
            [[...expected.keys()]],
          )
        ).rows.map((row) => [row.id, Number(row.money)]),
      );
    const moneyBefore = await balances();

    const result = await scheduler.tickNow(afterEnd);
    expect(result?.paidSeasons.map((p) => p.seasonId)).toContain(before.season.id);
    expect(result?.currentSeasonNumber).toBe(before.season.number + 1);

    const ledger = await pool.query<{
      player_id: string;
      amount: string;
      balance_before: string;
      balance_after: string;
    }>(
      "SELECT player_id, amount, balance_before, balance_after FROM economy_transactions WHERE type = 'season_reward' AND reference_id = $1",
      [before.season.id],
    );
    expect(new Map(ledger.rows.map((row) => [row.player_id, Number(row.amount)]))).toEqual(
      expected,
    );
    const moneyAfter = await balances();
    for (const [playerId, amount] of expected) {
      expect(moneyAfter.get(playerId)).toBe((moneyBefore.get(playerId) ?? 0) + amount);
    }
    const paid = await pool.query<{ rewards_paid_at: Date | null }>(
      'SELECT rewards_paid_at FROM seasons WHERE id = $1',
      [before.season.id],
    );
    expect(paid.rows[0]?.rewards_paid_at).not.toBeNull();

    // İkinci tur: aynı sezon tekrar ÖDENMEZ.
    const again = await scheduler.tickNow(afterEnd);
    expect(again?.paidSeasons.map((p) => p.seasonId)).not.toContain(before.season.id);
    const ledgerAgain = await pool.query(
      "SELECT 1 FROM economy_transactions WHERE type = 'season_reward' AND reference_id = $1",
      [before.season.id],
    );
    expect(ledgerAgain.rowCount).toBe(ledger.rowCount);

    // Yeni sezon eskisinin bittiği anda başlar (kesintisiz pencere).
    const next = await pool.query<{ starts_at: Date }>(
      'SELECT starts_at FROM seasons WHERE number = $1',
      [before.season.number + 1],
    );
    expect(next.rows[0]?.starts_at.toISOString()).toBe(before.season.endsAt);
  });
});
