import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { CareActionType } from '@at-sevdalisi/shared-types';
import type { CareLogRepository } from '../../application/ports/care-log.repository';
import { PG_POOL } from '../database/database.module';

/**
 * `horse_care_log` tablosuna okuyup yazan repository (`database/
 * migrations/0015_create_horse_care_log.up.sql`). `(horse_id, action_type)`
 * BİRLEŞİK birincil anahtardır — `recordPerformed` bu yüzden bir
 * `INSERT ... ON CONFLICT DO UPDATE` (upsert) kullanır: ilk eylemde satır
 * yaratılır, sonrakilerde AYNI satır güncellenir.
 */
@Injectable()
export class PostgresCareLogRepository implements CareLogRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findLastPerformedAt(horseId: string, actionType: CareActionType): Promise<Date | null> {
    const result = await this.pool.query<{ last_performed_at: Date }>(
      'SELECT last_performed_at FROM horse_care_log WHERE horse_id = $1 AND action_type = $2 LIMIT 1',
      [horseId, actionType],
    );
    return result.rows[0] ? result.rows[0].last_performed_at : null;
  }

  async recordPerformed(horseId: string, actionType: CareActionType, performedAt: Date): Promise<void> {
    await this.pool.query(
      `INSERT INTO horse_care_log (horse_id, action_type, last_performed_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (horse_id, action_type) DO UPDATE SET last_performed_at = EXCLUDED.last_performed_at`,
      [horseId, actionType, performedAt],
    );
  }
}
