import type { TrainingSession } from '@at-sevdalisi/shared-types';

/**
 * `TrainingSessionRepository` — Application katmanının Infrastructure'a
 * bağlandığı PORT (interface), diğer repository port'larıyla AYNI desen
 * (docs/ARCHITECTURE.md §4). `training_sessions` (migration 0005) her
 * antrenmanın geçmişini tutar (brief §7 `TrainingSession`); FAZ 1
 * wiring'in dördüncü diliminde yalnızca `save` gerekliydi.
 *
 * `findByHorseId` (bu turda EKLENDİ — docs/AUDIT_REPORT.md "Antrenman
 * geçmişi gösterimi" bulgusunun kapatılması, `GET /horses/:id/
 * training-history`): en yeniden en eskiye (`created_at DESC`) sıralı,
 * `limit` kadar kayıt döner — `RaceRepository.findRecentResultsByHorseId`
 * (market value dilimiyle AYNI desen) ile TUTARLI bir imza.
 */
export interface TrainingSessionRepository {
  save(session: TrainingSession): Promise<void>;
  findByHorseId(horseId: string, limit: number): Promise<TrainingSession[]>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const TRAINING_SESSION_REPOSITORY = Symbol('TRAINING_SESSION_REPOSITORY');
