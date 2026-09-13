import type { CareActionType } from '@at-sevdalisi/shared-types';

/**
 * `CareLogRepository` — Application katmanının Infrastructure'a bağlandığı
 * PORT (interface). `horse_care_log` (migration 0015) her (at, bakım
 * eylemi türü) çifti için en son yapılma zamanını tutar —
 * `domain/care/care.ts` `canPerformCareAction`'ın ihtiyaç duyduğu
 * `lastPerformedAt` parametresinin kaynağı. Besleme (feed) burada YOKTUR
 * — `applyFeed`'in bir cooldown parametresi yoktur (bkz.
 * `domain/care/care.ts`).
 */
export interface CareLogRepository {
  findLastPerformedAt(horseId: string, actionType: CareActionType): Promise<Date | null>;
  /** Bir eylem BAŞARIYLA uygulandıktan SONRA çağrılır — cooldown'un başlangıcını kaydeder. */
  recordPerformed(horseId: string, actionType: CareActionType, performedAt: Date): Promise<void>;
}

/** NestJS DI için token (interface'ler runtime'da yok olduğundan bir Symbol gerekir). */
export const CARE_LOG_REPOSITORY = Symbol('CARE_LOG_REPOSITORY');
