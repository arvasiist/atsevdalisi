import type { TrainingSession } from '@at-sevdalisi/shared-types';

/**
 * `TrainingSessionRepository` — Application katmanının Infrastructure'a
 * bağlandığı PORT (interface), diğer repository port'larıyla AYNI desen
 * (docs/ARCHITECTURE.md §4). `training_sessions` (migration 0005) her
 * antrenmanın geçmişini tutar (brief §7 `TrainingSession`); FAZ 1
 * wiring'in dördüncü diliminde yalnızca `save` gerekir — `GET
 * /horses/{id}/history` (docs/API.md §4) AYRI bir dilimin kapsamındadır.
 */
export interface TrainingSessionRepository {
  save(session: TrainingSession): Promise<void>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const TRAINING_SESSION_REPOSITORY = Symbol('TRAINING_SESSION_REPOSITORY');
