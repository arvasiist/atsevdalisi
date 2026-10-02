import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { SeasonInfoView } from '@at-sevdalisi/shared-types';
import type { PlayerRaceRecord } from '../../application/ports/leaderboard.repository';
import type { SeasonRepository } from '../../application/ports/season.repository';
import { credit } from '../../domain/economy/wallet';
import { calculateSeasonEndDate, getSeasonStatus } from '../../domain/season/season';
import { PG_POOL, withTransaction } from '../database/database.module';

interface SeasonRow {
  id: string;
  number: number;
  name: string;
  starts_at: Date;
  ends_at: Date;
  rewards_paid_at: Date | null;
}

/** Sezon açma kilidi — sabit anahtarlı `pg_advisory_xact_lock` (transaction bitince düşer). */
const SEASON_CREATE_LOCK_KEY = 6_900_069;

function rowToSeason(row: SeasonRow, now: Date): SeasonInfoView {
  const season = {
    id: row.id,
    name: row.name,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
  };
  return {
    ...season,
    number: row.number,
    status: getSeasonStatus(season, now),
    rewardsPaidAt: row.rewards_paid_at ? row.rewards_paid_at.toISOString() : null,
  };
}

const RECORDS_SQL = `
  SELECT h.owner_id          AS owner_id,
         p.username          AS username,
         p.display_name      AS display_name,
         e.performance_score AS performance_score,
         e.finish_position   AS finish_position,
         r.start_time        AS start_time
    FROM race_entries e
    JOIN races   r ON r.id = e.race_id
    JOIN horses  h ON h.id = e.horse_id
    JOIN players p ON p.id = h.owner_id
   WHERE e.finish_position IS NOT NULL
     AND e.performance_score IS NOT NULL
     AND r.start_time >= $1 AND r.start_time < $2
     -- 02.10.2026 (migration 0059): silinmiş hesap sıralamaya ve ödüle girmez.
     AND p.deleted_at IS NULL
   ORDER BY r.start_time ASC`;

interface RecordRow {
  owner_id: string;
  username: string;
  display_name: string;
  performance_score: string;
  finish_position: number;
  start_time: Date;
}

async function queryRecords(
  db: Pool | PoolClient,
  startsAt: string,
  endsAt: string,
): Promise<PlayerRaceRecord[]> {
  const result = await db.query<RecordRow>(RECORDS_SQL, [startsAt, endsAt]);
  return result.rows.map((row) => ({
    playerId: row.owner_id,
    username: row.username,
    displayName: row.display_name,
    // NUMERIC metin döner (CLAUDE.md) — `Number(...)` şart.
    performanceScore: Number(row.performance_score),
    finishPosition: row.finish_position,
    finishedAt: row.start_time.toISOString(),
  }));
}

@Injectable()
export class PostgresSeasonRepository implements SeasonRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async ensureCurrentSeason(now: Date, durationDays: number): Promise<SeasonInfoView> {
    const existing = await this.findCovering(this.pool, now);
    if (existing) {
      return rowToSeason(existing, now);
    }
    return withTransaction(this.pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [SEASON_CREATE_LOCK_KEY]);
      // Kilidi bekleyen ikinci çağrı, birincinin açtığı sezonu burada görür.
      const again = await this.findCovering(client, now);
      if (again) {
        return rowToSeason(again, now);
      }
      const last = await client.query<SeasonRow>(
        'SELECT * FROM seasons ORDER BY number DESC LIMIT 1',
      );
      let number = (last.rows[0]?.number ?? 0) + 1;
      // Ardışık sezonlar: kesintisiz pencere. Uzun bir kesintiden sonra
      // atlanan sezonlar da (boş olarak) açılır ki numaralar takvimle örtüşsün.
      let startsAt = last.rows[0] ? last.rows[0].ends_at : now;
      let created: SeasonRow | undefined;
      do {
        const endsAt = calculateSeasonEndDate(startsAt, durationDays);
        const inserted = await client.query<SeasonRow>(
          'INSERT INTO seasons (number, name, starts_at, ends_at) VALUES ($1, $2, $3, $4) RETURNING *',
          [number, `Sezon ${number}`, startsAt, endsAt],
        );
        created = inserted.rows[0];
        startsAt = endsAt;
        number += 1;
      } while (created && created.ends_at.getTime() <= now.getTime());
      return rowToSeason(created as SeasonRow, now);
    });
  }

  async findPreviousSeason(now: Date): Promise<SeasonInfoView | null> {
    const result = await this.pool.query<SeasonRow>(
      'SELECT * FROM seasons WHERE ends_at <= $1 ORDER BY ends_at DESC LIMIT 1',
      [now],
    );
    const row = result.rows[0];
    return row ? rowToSeason(row, now) : null;
  }

  async findUnpaidEndedSeasons(now: Date): Promise<SeasonInfoView[]> {
    const result = await this.pool.query<SeasonRow>(
      'SELECT * FROM seasons WHERE ends_at <= $1 AND rewards_paid_at IS NULL ORDER BY number ASC',
      [now],
    );
    return result.rows.map((row) => rowToSeason(row, now));
  }

  findRecordsInWindow(startsAt: string, endsAt: string): Promise<PlayerRaceRecord[]> {
    return queryRecords(this.pool, startsAt, endsAt);
  }

  async paySeasonRewards(
    seasonId: string,
    now: Date,
    computePayouts: (records: PlayerRaceRecord[]) => Array<{ playerId: string; amount: number }>,
  ): Promise<Array<{ playerId: string; amount: number }> | null> {
    return withTransaction(this.pool, async (client) => {
      const locked = await client.query<SeasonRow>(
        'SELECT * FROM seasons WHERE id = $1 FOR UPDATE',
        [seasonId],
      );
      const season = locked.rows[0];
      // Durum kapısı KİLİT ALTINDA: zamanlayıcının iki turu (ya da iki süreç)
      // aynı sezonu iki kez ödeyemez.
      if (!season || season.rewards_paid_at !== null || season.ends_at.getTime() > now.getTime()) {
        return null;
      }
      const records = await queryRecords(
        client,
        season.starts_at.toISOString(),
        season.ends_at.toISOString(),
      );
      const payouts = computePayouts(records)
        .filter((payout) => payout.amount > 0)
        .sort((a, b) => a.playerId.localeCompare(b.playerId)); // kilit sırası sabit → çapraz kilit yok
      for (const payout of payouts) {
        const balance = await client.query<{ money: string }>(
          'SELECT money FROM players WHERE id = $1 FOR UPDATE',
          [payout.playerId],
        );
        const row = balance.rows[0];
        if (!row) {
          continue; // Oyuncu silinmiş: ödül kimseye yazılmaz.
        }
        const before = Number(row.money);
        const after = credit({ money: before, gems: 0 }, payout.amount, 'money').money;
        await client.query('UPDATE players SET money = $2, updated_at = $3 WHERE id = $1', [
          payout.playerId,
          after,
          now,
        ]);
        await client.query(
          `INSERT INTO economy_transactions
             (player_id, type, amount, currency, reference_type, reference_id, balance_before, balance_after)
           VALUES ($1, 'season_reward', $2, 'money', 'seasons', $3, $4, $5)`,
          [payout.playerId, after - before, seasonId, before, after],
        );
      }
      await client.query('UPDATE seasons SET rewards_paid_at = $2 WHERE id = $1', [seasonId, now]);
      return payouts;
    });
  }

  private async findCovering(db: Pool | PoolClient, now: Date): Promise<SeasonRow | undefined> {
    const result = await db.query<SeasonRow>(
      'SELECT * FROM seasons WHERE starts_at <= $1 AND ends_at > $1 ORDER BY number DESC LIMIT 1',
      [now],
    );
    return result.rows[0];
  }
}
