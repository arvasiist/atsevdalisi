import type { CareConfig, StableConfig } from '@at-sevdalisi/game-config';

/**
 * 15.10.2026 — zamanla toparlanma turu (S3). Uygulama `pg` bilmez; tur tek
 * atomik ifadedir (`infrastructure/horse/race-condition.ts` → `recoverHorseVitals`).
 */
export interface HorseRecoveryRepository {
  /** Damgası `now`dan eski, dolu olmayan atları toparlar; güncellenen at sayısını döner. */
  recoverDue(now: Date, care: CareConfig, stable: StableConfig): Promise<number>;
}

export const HORSE_RECOVERY_REPOSITORY = Symbol('HORSE_RECOVERY_REPOSITORY');
