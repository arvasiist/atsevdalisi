import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { TrainingSession } from '@at-sevdalisi/shared-types';
import type { TrainingSessionRepository } from '../../application/ports/training-session.repository';
import { PG_POOL } from '../database/database.module';

/**
 * `training_sessions` tablosuna yazan repository (`database/migrations/
 * 0005_create_training_sessions.up.sql`). `stat_gain` bir JSONB sütundur
 * — `pg`'ye düz bir JS nesnesi değil, `JSON.stringify(...)` ile
 * SERİLEŞTİRİLMİŞ bir string olarak verilir (aksi halde `pg`
 * `[object Object]`'e dönüştürür). `fatigue_gain`/`injury_risk`
 * `NUMERIC(5,2)`'dir — yazarken `Number` olarak vermek yeterlidir
 * (`pg` bunları yazarken otomatik dönüştürür; okurken STRING dönmesi
 * AYRI bir konudur, bkz. `postgres-horse.repository.ts`).
 */
@Injectable()
export class PostgresTrainingSessionRepository implements TrainingSessionRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async save(session: TrainingSession): Promise<void> {
    await this.pool.query(
      `INSERT INTO training_sessions (id, horse_id, type, intensity, duration_minutes, stat_gain, fatigue_gain, injury_risk, injury_occurred, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        session.id,
        session.horseId,
        session.type,
        session.intensity,
        session.durationMinutes,
        JSON.stringify(session.statGain),
        session.fatigueGain,
        session.injuryRisk,
        session.injuryOccurred,
        new Date(session.createdAt),
      ],
    );
  }
}
