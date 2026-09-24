import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { HorseSurfaceStats } from '@at-sevdalisi/shared-types';
import type { HorseSurfaceStatsRepository } from '../../application/ports/horse-surface-stats.repository';
import { PG_POOL } from '../database/database.module';

/**
 * `horse_surface_stats` tablosunun satır şekli (`database/migrations/
 * 0003_create_horse_stat_tables.up.sql`). Tüm `NUMERIC(5,2)` sütunlar
 * `node-postgres` tarafından STRING döner (bkz. `postgres-horse.repository.ts`
 * üstündeki AYNI not) — `Number(...)`'a çevrilir.
 */
interface HorseSurfaceStatsRow {
  horse_id: string;
  grass: string;
  dirt: string;
  wet: string;
  heavy: string;
  dry: string;
  mud: string;
}

function rowToHorseSurfaceStats(row: HorseSurfaceStatsRow): HorseSurfaceStats {
  return {
    horseId: row.horse_id,
    grass: Number(row.grass),
    dirt: Number(row.dirt),
    wet: Number(row.wet),
    heavy: Number(row.heavy),
    dry: Number(row.dry),
    mud: Number(row.mud),
  };
}

@Injectable()
export class PostgresHorseSurfaceStatsRepository implements HorseSurfaceStatsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByHorseId(horseId: string): Promise<HorseSurfaceStats | null> {
    const result = await this.pool.query<HorseSurfaceStatsRow>(
      'SELECT * FROM horse_surface_stats WHERE horse_id = $1 LIMIT 1',
      [horseId],
    );
    return result.rows[0] ? rowToHorseSurfaceStats(result.rows[0]) : null;
  }
}
