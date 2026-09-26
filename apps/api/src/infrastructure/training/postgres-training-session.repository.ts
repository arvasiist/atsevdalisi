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

  /**
   * `findByHorseId` (bu turda EKLENDİ — bkz. port'un doc yorumu).
   * `stat_gain` bir JSONB sütunudur — `node-postgres`'in DAHİLİ tip
   * ayrıştırıcısı (oid 3802) bunu ZATEN otomatik olarak `JSON.parse` eder
   * (bkz. `pg-types` varsayılan davranışı), bu yüzden `row.stat_gain`
   * BURADA elle `JSON.parse` EDİLMEZ — doğrudan bir JS nesnesi olarak
   * gelir. `fatigue_gain`/`injury_risk` ise `NUMERIC(5,2)`'dir — dosya
   * başı doc yorumundaki AYNI sebeple (`pg` hassasiyet kaybını önlemek
   * için NUMERIC'i STRING döner) `Number(...)`'a çevrilir.
   */
  async findByHorseId(horseId: string, limit: number): Promise<TrainingSession[]> {
    const result = await this.pool.query<{
      id: string;
      horse_id: string;
      type: TrainingSession['type'];
      intensity: TrainingSession['intensity'];
      duration_minutes: number;
      stat_gain: Partial<Record<string, number>>;
      fatigue_gain: string;
      injury_risk: string;
      injury_occurred: boolean;
      created_at: Date;
    }>(
      `SELECT id, horse_id, type, intensity, duration_minutes, stat_gain, fatigue_gain, injury_risk, injury_occurred, created_at
       FROM training_sessions
       WHERE horse_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [horseId, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      horseId: row.horse_id,
      type: row.type,
      intensity: row.intensity,
      durationMinutes: row.duration_minutes,
      statGain: row.stat_gain,
      fatigueGain: Number(row.fatigue_gain),
      injuryRisk: Number(row.injury_risk),
      injuryOccurred: row.injury_occurred,
      createdAt: row.created_at.toISOString(),
    }));
  }
}
