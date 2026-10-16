import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { HorseCareerRaceView, HorseCareerView, HorseRecordSummary } from '@at-sevdalisi/shared-types';
import type { HorseCareerRepository } from '../../application/ports/horse-career.repository';
import { PG_POOL } from '../database/database.module';

/**
 * Atın koşusundan gelen ödül satırları. Kaybeden iadesi (`*_loser_refund`)
 * kazanç DEĞİLDİR (ödenen bedelin geri dönüşüdür), sayılmaz.
 */
const PRIZE_LEDGER_TYPES = ['practice_race_prize', 'lobby_race_prize'];

/**
 * Bitmiş, iptal edilmemiş koşular. Koşturan oyuncu `e.player_id`dir (CLAUDE.md
 * (55)); eski satırda NULL ise at sahibi. Ödül o oyuncuya, o yarışa yazılan
 * defter satırlarından okunur — oyuncu bir yarışa tek atla girer (lobi tekil
 * kısıtı, pratik/PvP tek at), bu yüzden (yarış, oyuncu) ödülü atındır.
 * ⚠️ `reference_id` METİNDİR → `::text` (CLAUDE.md (45)).
 */
const RUNS_CTE = `
  runs AS (
    SELECT re.horse_id, re.race_id, re.finish_position,
           COALESCE(re.player_id, h.owner_id) AS runner_id
    FROM race_entries re
    JOIN horses h ON h.id = re.horse_id
    WHERE re.horse_id = ANY($1::uuid[])
      AND re.finish_position IS NOT NULL
      AND re.status IS DISTINCT FROM 'cancelled'
  )`;

interface RecordRow {
  horse_id: string;
  starts: string;
  wins: string;
  seconds: string;
  thirds: string;
  places: string;
  best: number | null;
  earnings: string;
  foals: string;
}

interface CareerRaceRow {
  race_id: string;
  race_name: string;
  ran_at: Date;
  distance_m: number;
  surface: HorseCareerRaceView['surface'];
  track_key: string | null;
  finish_position: number;
  field_size: string;
  prize: string;
}

function toSummary(row: RecordRow): HorseRecordSummary {
  return {
    starts: Number(row.starts),
    wins: Number(row.wins),
    places: Number(row.places),
    earnings: Number(row.earnings),
    foals: Number(row.foals),
  };
}

@Injectable()
export class PostgresHorseCareerRepository implements HorseCareerRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findCareer(horseId: string, recentLimit: number): Promise<HorseCareerView | null> {
    const records = await this.queryRecords([horseId]);
    const row = records[0];
    if (!row) {
      return null;
    }
    const races = await this.pool.query<CareerRaceRow>(
      `SELECT r.id AS race_id, r.name AS race_name, r.start_time AS ran_at, r.distance_m, r.surface,
              t.track_key, re.finish_position,
              (SELECT COUNT(*) FROM race_entries x
                WHERE x.race_id = r.id AND x.finish_position IS NOT NULL
                  AND x.status IS DISTINCT FROM 'cancelled') AS field_size,
              COALESCE((
                SELECT SUM(et.amount) FROM economy_transactions et
                WHERE et.reference_type = 'race' AND et.reference_id = r.id::text
                  AND et.player_id = COALESCE(re.player_id, h.owner_id)
                  AND et.type = ANY($3::text[])
              ), 0) AS prize
       FROM race_entries re
       JOIN races r ON r.id = re.race_id
       JOIN horses h ON h.id = re.horse_id
       LEFT JOIN tracks t ON t.id = r.track_id
       WHERE re.horse_id = $1 AND re.finish_position IS NOT NULL
         AND re.status IS DISTINCT FROM 'cancelled'
       ORDER BY r.start_time DESC, r.id
       LIMIT $2`,
      [horseId, recentLimit, PRIZE_LEDGER_TYPES],
    );
    return {
      horseId,
      ...toSummary(row),
      seconds: Number(row.seconds),
      thirds: Number(row.thirds),
      bestPosition: row.best,
      recentRaces: races.rows.map((race) => ({
        raceId: race.race_id,
        raceName: race.race_name,
        ranAt: race.ran_at.toISOString(),
        distanceMeters: race.distance_m,
        surface: race.surface,
        hippodromeKey: race.track_key,
        fieldSize: Number(race.field_size),
        finishPosition: race.finish_position,
        prize: Number(race.prize),
      })),
    };
  }

  async findRecordsByHorseIds(horseIds: readonly string[]): Promise<Map<string, HorseRecordSummary>> {
    const result = new Map<string, HorseRecordSummary>();
    if (horseIds.length === 0) {
      return result;
    }
    for (const row of await this.queryRecords(horseIds)) {
      result.set(row.horse_id, toSummary(row));
    }
    return result;
  }

  /** Tek sorgu: koşu sayıları, ödül toplamı, tay sayısı (bulunmayan at satır üretmez). */
  private async queryRecords(horseIds: readonly string[]): Promise<RecordRow[]> {
    const result = await this.pool.query<RecordRow>(
      `WITH ${RUNS_CTE},
       run_totals AS (
         SELECT horse_id,
                COUNT(*) AS starts,
                COUNT(*) FILTER (WHERE finish_position = 1) AS wins,
                COUNT(*) FILTER (WHERE finish_position = 2) AS seconds,
                COUNT(*) FILTER (WHERE finish_position = 3) AS thirds,
                COUNT(*) FILTER (WHERE finish_position <= 3) AS places,
                MIN(finish_position) AS best
         FROM runs GROUP BY horse_id
       ),
       prizes AS (
         SELECT runs.horse_id, SUM(t.amount) AS earnings
         FROM runs
         JOIN economy_transactions t
           ON t.reference_type = 'race' AND t.reference_id = runs.race_id::text
          AND t.player_id = runs.runner_id
          AND t.type = ANY($2::text[])
         GROUP BY runs.horse_id
       ),
       foals AS (
         SELECT parent_id, COUNT(*) AS foals FROM (
           SELECT mare_id AS parent_id FROM breeding_pairs
             WHERE foal_id IS NOT NULL AND mare_id = ANY($1::uuid[])
           UNION ALL
           SELECT stallion_id FROM breeding_pairs
             WHERE foal_id IS NOT NULL AND stallion_id = ANY($1::uuid[])
         ) parents GROUP BY parent_id
       )
       SELECT h.id AS horse_id,
              COALESCE(rt.starts, 0) AS starts, COALESCE(rt.wins, 0) AS wins,
              COALESCE(rt.seconds, 0) AS seconds, COALESCE(rt.thirds, 0) AS thirds,
              COALESCE(rt.places, 0) AS places, rt.best,
              COALESCE(p.earnings, 0) AS earnings, COALESCE(f.foals, 0) AS foals
       FROM horses h
       LEFT JOIN run_totals rt ON rt.horse_id = h.id
       LEFT JOIN prizes p ON p.horse_id = h.id
       LEFT JOIN foals f ON f.parent_id = h.id
       WHERE h.id = ANY($1::uuid[])`,
      [horseIds, PRIZE_LEDGER_TYPES],
    );
    return result.rows;
  }
}
