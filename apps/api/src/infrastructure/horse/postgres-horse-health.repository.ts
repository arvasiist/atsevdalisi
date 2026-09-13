import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { CareableHealthView } from '@at-sevdalisi/shared-types';
import type { HorseHealthRepository } from '../../application/ports/horse-health.repository';
import { PG_POOL } from '../database/database.module';

/**
 * `horse_health` tablosunun, bu repository'nin ilgilendiği SÜTUNLARI
 * (`database/migrations/0003_create_horse_stat_tables.up.sql`) — tam
 * satır DEĞİL, yalnızca `CareableHealthView` alt kümesi (bkz.
 * `application/ports/horse-health.repository.ts` üstündeki KAPSAM notu).
 * `NUMERIC(5,2)` sütunlar `node-postgres` tarafından STRING döner (bkz.
 * `postgres-horse.repository.ts`'teki AYNI not) — `Number(...)`'a çevrilir.
 */
interface CareableHealthRow {
  injury_risk: string;
  recovery_rate: string;
  joint_condition: string;
  weight_condition: string;
}

function rowToCareableHealth(row: CareableHealthRow): CareableHealthView {
  return {
    injuryRisk: Number(row.injury_risk),
    recoveryRate: Number(row.recovery_rate),
    jointCondition: Number(row.joint_condition),
    weightCondition: Number(row.weight_condition),
  };
}

@Injectable()
export class PostgresHorseHealthRepository implements HorseHealthRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findCareableHealth(horseId: string): Promise<CareableHealthView | null> {
    const result = await this.pool.query<CareableHealthRow>(
      'SELECT injury_risk, recovery_rate, joint_condition, weight_condition FROM horse_health WHERE horse_id = $1 LIMIT 1',
      [horseId],
    );
    return result.rows[0] ? rowToCareableHealth(result.rows[0]) : null;
  }

  async updateCareableFields(horseId: string, health: CareableHealthView): Promise<void> {
    await this.pool.query(
      `UPDATE horse_health
       SET injury_risk = $2, recovery_rate = $3, joint_condition = $4, weight_condition = $5
       WHERE horse_id = $1`,
      [horseId, health.injuryRisk, health.recoveryRate, health.jointCondition, health.weightCondition],
    );
  }
}
