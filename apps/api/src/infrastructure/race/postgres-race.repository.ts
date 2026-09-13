import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Race, RaceEntry, RaceSegmentSnapshot } from '@at-sevdalisi/shared-types';
import type { RaceRepository } from '../../application/ports/race.repository';
import { PG_POOL, withTransaction } from '../database/database.module';

/**
 * `races`/`race_entries`/`race_entry_segments` tablolarına yazan
 * repository (`database/migrations/0006_create_races_and_entries.up.sql`,
 * `0014_add_race_segment_faz5_fields.up.sql`). FAZ 1 wiring, sekizinci
 * dilim — Pratik Yarış: bkz. `application/ports/race.repository.ts`
 * üstündeki not (transaction burada "ya hepsi ya hiçbiri" için, satır
 * kilitleme İÇİN DEĞİL — `PostgresPlayerRepository.updateWithLock` ile
 * KARIŞTIRILMASIN).
 */
@Injectable()
export class PostgresRaceRepository implements RaceRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async savePracticeRace(race: Race, entry: RaceEntry, segments: RaceSegmentSnapshot[]): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO races (id, track_id, name, distance_m, surface, weather, temperature_c, wind_kmh, humidity_pct, participant_limit, entry_fee, prize_pool, start_time, status, simulation_seed, created_at, updated_at)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, NULL, NULL, $7, 0, 0, $8, $9, $10, $11, $11)`,
        [
          race.id,
          race.name,
          race.distanceMeters,
          race.surface,
          race.weather,
          race.temperatureC,
          race.participantLimit,
          new Date(race.startTime),
          race.status,
          race.simulationSeed,
          new Date(race.createdAt),
        ],
      );

      await client.query(
        `INSERT INTO race_entries (id, race_id, horse_id, jockey_id, gate_position, tactical_style, risk_level, horse_snapshot, final_time_ms, finish_position, performance_score, created_at)
         VALUES ($1, $2, $3, NULL, NULL, $4, $5, $6, $7, $8, $9, $10)`,
        [
          entry.id,
          entry.raceId,
          entry.horseId,
          entry.tacticalStyle,
          entry.riskLevel,
          JSON.stringify(entry.horseSnapshot),
          entry.finalTimeMs,
          entry.finishPosition,
          entry.performanceScore,
          new Date(entry.createdAt),
        ],
      );

      for (const segment of segments) {
        await client.query(
          `INSERT INTO race_entry_segments (race_entry_id, segment_distance_m, timestamp_ms, position_m, speed, stamina, fatigue, lane, tactical_state, current_rank, blocked, jockey_decision)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            entry.id,
            segment.segmentDistanceMeters,
            segment.timestampMs,
            segment.positionMeters,
            segment.speed,
            segment.stamina,
            segment.fatigue,
            segment.lane,
            segment.tacticalState,
            segment.currentRank,
            segment.blocked,
            segment.decision,
          ],
        );
      }
    });
  }
}
