import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { HorseDistanceStats } from '@at-sevdalisi/shared-types';
import type { HorseDistanceStatsRepository } from '../../application/ports/horse-distance-stats.repository';
import { PG_POOL } from '../database/database.module';

/**
 * `horse_distance_stats` tablosunun satır şekli (`database/migrations/
 * 0003_create_horse_stat_tables.up.sql`). Tüm `NUMERIC(5,2)` sütunlar
 * `node-postgres` tarafından STRING döner (bkz. `postgres-horse.repository.ts`
 * üstündeki AYNI not) — `Number(...)`'a çevrilir.
 */
interface HorseDistanceStatsRow {
  horse_id: string;
  short_distance: string;
  middle_distance: string;
  long_distance: string;
}

function rowToHorseDistanceStats(row: HorseDistanceStatsRow): HorseDistanceStats {
  return {
    horseId: row.horse_id,
    shortDistance: Number(row.short_distance),
    middleDistance: Number(row.middle_distance),
    longDistance: Number(row.long_distance),
  };
}

@Injectable()
export class PostgresHorseDistanceStatsRepository implements HorseDistanceStatsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByHorseId(horseId: string): Promise<HorseDistanceStats | null> {
    const result = await this.pool.query<HorseDistanceStatsRow>(
      'SELECT * FROM horse_distance_stats WHERE horse_id = $1 LIMIT 1',
      [horseId],
    );
    return result.rows[0] ? rowToHorseDistanceStats(result.rows[0]) : null;
  }
}
